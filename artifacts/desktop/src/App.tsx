import React from "react";
import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { ProjectView } from "./pages/ProjectView";

function App() {
  return (
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
      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}

export default App;
