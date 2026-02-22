import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6 text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-gold mx-auto" />
          <h1 className="text-2xl font-display text-foreground">Page Not Found</h1>
          <p className="text-sm text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Link href="/">
            <Button variant="outline" className="mt-2">Back to Home</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
