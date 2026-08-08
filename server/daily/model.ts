/**
 * The model client.
 *
 * Bedrock, through the **Converse API** rather than a vendor SDK. That choice
 * is deliberate: the model in use is `zai.glm-5`, which is not an Anthropic
 * model, and Converse is the one interface on Bedrock that speaks to every
 * provider with the same message shape. Swapping GLM-5 for Claude, Nova or
 * anything else later is then a config change, not a rewrite.
 *
 * Bedrock is also the right home for this on the merits: it's what the
 * business already runs on, it can sit under a BAA — which matters when the
 * surrounding business is health and insurance — and serverless GLM-5 is
 * roughly Haiku-priced for Sonnet-class output, at one short call per member
 * per day.
 *
 * ── Configuration ─────────────────────────────────────────────────────────
 *
 *   SAKRED_DAILY_MODEL      Bedrock model id or inference-profile ARN.
 *                           Defaults to "zai.glm-5".
 *   AWS_REGION              defaults to us-west-2, where GLM-5 is serverless.
 *   SAKRED_MODEL_PROVIDER   "bedrock" | "anthropic" | "auto" (default auto).
 *   ANTHROPIC_API_KEY       used only when Bedrock isn't available — local
 *                           development without AWS credentials.
 *
 * Credentials come from the ambient AWS chain: env vars, SSO profile, or the
 * execution role in a deployed environment. Nothing is read from disk here.
 */

export type Provider = "bedrock" | "anthropic" | "none";

export interface ModelReply {
  text: string;
}

export interface ModelClient {
  provider: Provider;
  model: string;
  complete(args: {
    system: string;
    messages: { role: "user" | "assistant"; content: string }[];
    maxTokens?: number;
    temperature?: number;
  }): Promise<ModelReply>;
}

let cached: ModelClient | null | undefined;

const DEFAULT_MODEL = "zai.glm-5";
const DEFAULT_REGION = "us-west-2";

function configuredModel(): string {
  return process.env.SAKRED_DAILY_MODEL?.trim() || DEFAULT_MODEL;
}

function wantsProvider(): "bedrock" | "anthropic" | "auto" {
  const p = process.env.SAKRED_MODEL_PROVIDER?.trim().toLowerCase();
  if (p === "bedrock" || p === "anthropic") return p;
  return "auto";
}

async function buildBedrock(model: string): Promise<ModelClient | null> {
  try {
    const { BedrockRuntimeClient, ConverseCommand } = await import(
      "@aws-sdk/client-bedrock-runtime"
    );

    // Credentials come from the ambient AWS chain, in this order: env vars,
    // then a named profile, then the instance/task role. Preferring the chain
    // means a developer can use `aws configure --profile sakred` and never
    // put a secret in a file at all.
    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION?.trim() || DEFAULT_REGION,
    });

    return {
      provider: "bedrock",
      model,
      async complete({ system, messages, maxTokens = 600, temperature = 0.7 }) {
        const response = await client.send(
          new ConverseCommand({
            modelId: model,
            // Converse takes system as its own block list, not a message.
            system: [{ text: system }],
            messages: messages.map((m) => ({
              role: m.role,
              content: [{ text: m.content }],
            })),
            inferenceConfig: { maxTokens, temperature },
          }),
        );

        const text = (response.output?.message?.content ?? [])
          .map((block) => block.text ?? "")
          .join("");

        return { text };
      },
    };
  } catch (err) {
    console.error("[daily] Bedrock client unavailable:", err);
    return null;
  }
}

/**
 * Direct Anthropic API — local development only, so a laptop without AWS
 * credentials can still exercise the real path.
 */
async function buildAnthropic(model: string): Promise<ModelClient | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const { default: AnthropicSDK } = await import("@anthropic-ai/sdk");
    const client = new AnthropicSDK({ apiKey });

    return {
      provider: "anthropic",
      model,
      async complete({ system, messages, maxTokens = 600, temperature = 0.7 }) {
        const response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          temperature,
          system,
          messages,
        });
        const text = response.content
          .filter((b): b is { type: "text"; text: string; citations: never } => b.type === "text")
          .map((b) => b.text)
          .join("");
        return { text };
      },
    };
  } catch (err) {
    console.error("[daily] Anthropic client unavailable:", err);
    return null;
  }
}

/**
 * The client, or null when nothing is configured.
 *
 * Null is a supported state rather than an error: the caller falls back to
 * computed text, so an unconfigured environment produces terse true notes
 * instead of a broken screen.
 */
export async function getModelClient(): Promise<ModelClient | null> {
  if (cached !== undefined) return cached;

  const model = configuredModel();
  const want = wantsProvider();

  // On Vercel the execution role isn't present, so an explicit key pair or a
  // profile is what tells us Bedrock is actually reachable.
  const hasAwsCreds =
    !!process.env.AWS_ACCESS_KEY_ID ||
    !!process.env.AWS_PROFILE ||
    !!process.env.AWS_ROLE_ARN ||
    !!process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
    !!process.env.AWS_WEB_IDENTITY_TOKEN_FILE;

  if (want === "bedrock" || (want === "auto" && hasAwsCreds)) {
    const bedrock = await buildBedrock(model);
    if (bedrock) {
      cached = bedrock;
      return cached;
    }
    if (want === "bedrock") {
      cached = null;
      return cached;
    }
  }

  cached = await buildAnthropic(model);
  if (!cached) {
    console.warn(
      "[daily] no model provider configured — every note will use the computed fallback. " +
        "Set AWS credentials for Bedrock, or ANTHROPIC_API_KEY for local development.",
    );
  }
  return cached;
}

/** Test seam — forget the cached client so env changes take effect. */
export function resetModelClient() {
  cached = undefined;
}
