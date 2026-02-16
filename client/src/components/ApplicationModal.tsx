import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertApplicationSchema, type InsertApplication } from "@shared/schema";
import { useCreateApplication } from "@/hooks/use-applications";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Send } from "lucide-react";

interface ApplicationModalProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ApplicationModal({ trigger, open, onOpenChange }: ApplicationModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  const createApplication = useCreateApplication();

  const form = useForm<InsertApplication>({
    resolver: zodResolver(insertApplicationSchema),
    defaultValues: {
      name: "",
      email: "",
      goals: "",
      stressLevel: "",
      willingness: "",
      constraints: "",
      whyNow: "",
    },
  });

  const onSubmit = (data: InsertApplication) => {
    createApplication.mutate(data, {
      onSuccess: () => {
        setSubmitted(true);
        form.reset();
      },
    });
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setTimeout(() => setSubmitted(false), 300);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" data-testid="dialog-application">
        {submitted ? (
          <div className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-gold-subtle flex items-center justify-center mx-auto mb-6">
              <Send className="h-7 w-7 text-gold" />
            </div>
            <h3 className="text-2xl font-display mb-3" data-testid="text-success-heading">Application Received</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              We will review your application and reach out within 48 hours to schedule a fit call. 
              High integrity only.
            </p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl font-display tracking-tight" data-testid="text-modal-title">
                Apply for <span className="text-gold">Sakred Body</span>
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Clarity over complexity. Answer truthfully. This is your first step toward recalibration.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4" data-testid="form-application">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-sans font-semibold">Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Your full name" {...field} data-testid="input-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-sans font-semibold">Email</FormLabel>
                        <FormControl>
                          <Input placeholder="you@example.com" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="goals"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-sans font-semibold">Goals (energy, sleep, digestion, mental clarity, performance)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="What are your primary health and performance goals?" 
                          className="resize-none min-h-[80px]" 
                          {...field} 
                          data-testid="input-goals"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="stressLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-sans font-semibold">Current Stress Level & Schedule</FormLabel>
                        <FormControl>
                          <Input placeholder="High — traveling 60% of the month" {...field} data-testid="input-stress" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="willingness"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-sans font-semibold">Willingness to Implement</FormLabel>
                        <FormControl>
                          <Input placeholder="Fully committed to the process" {...field} data-testid="input-willingness" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="constraints"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-sans font-semibold">Any Major Constraints</FormLabel>
                      <FormControl>
                        <Input placeholder="Time, physical limitations, dietary restrictions..." {...field} data-testid="input-constraints" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="whyNow"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-sans font-semibold">Why Now? Why This?</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="What's driving you to make this change right now?" 
                          className="resize-none min-h-[80px]" 
                          {...field} 
                          data-testid="input-why-now"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="pt-4 flex justify-end">
                  <Button 
                    type="submit" 
                    disabled={createApplication.isPending}
                    className="w-full md:w-auto bg-gold text-background border-gold-subtle font-sans font-semibold tracking-wide"
                    data-testid="button-submit-application"
                  >
                    {createApplication.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        Submit Application <Send className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
