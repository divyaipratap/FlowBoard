import React, { useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { ProjectView } from "./pages/ProjectView";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  const base = import.meta.env.BASE_URL || "/";

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen w-full bg-[#0a0a0a] text-foreground font-sans overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/projects/:projectId/*?" component={ProjectView} />
            <Route>
              <div className="flex-1 flex items-center justify-center">
                <h1 className="text-xl text-muted-foreground">404 Not Found</h1>
              </div>
            </Route>
          </Switch>
        </main>
      </div>
      <Toaster theme="dark" position="bottom-right" />
    </QueryClientProvider>
  );
}

export default App;
