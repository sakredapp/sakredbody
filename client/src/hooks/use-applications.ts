import { useMutation } from "@tanstack/react-query";
import { api, type InsertApplication } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useCreateApplication() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertApplication) => {
      // Zod validation is handled by react-hook-form before this, 
      // but we do a final check against the schema to ensure type safety
      const validated = api.applications.create.input.parse(data);
      
      const res = await fetch(api.applications.create.path, {
        method: api.applications.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });

      if (!res.ok) {
        // Handle validation errors or server errors
        if (res.status === 400) {
          const error = await res.json();
          throw new Error(error.message || "Validation failed");
        }
        throw new Error("Failed to submit application");
      }

      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Application Received",
        description: "We will review your details and be in touch shortly.",
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Submission Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
