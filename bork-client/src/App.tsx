import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./components/app-sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/toaster";
import { BrowserRouter, Route, Routes } from "react-router-dom"; 
// NOTE: Ensure you're using "react-router-dom" not "react-router"

import Analysis from "./routes/analysis";
import Home from "./routes/home";
import useVersion from "./hooks/use-version";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
    },
  },
});

function App() {
  useVersion();
  return (
    <QueryClientProvider client={queryClient}>
      <div
        className="dark antialiased"
        style={{
          colorScheme: "dark",
        }}
      >
        <BrowserRouter>
          <TooltipProvider delayDuration={0}>
            <SidebarProvider>
              <AppSidebar />
              <SidebarInset>
                <div className="flex flex-1 flex-col gap-4 size-full container">
                  <Routes>
                    <Route path="/" element={<Home />} />
                    {/* CHANGED: route param is `:walletAddress` */}
                    <Route path="analysis/:walletAddress" element={<Analysis />} />
                  </Routes>
                </div>
              </SidebarInset>
            </SidebarProvider>
            <Toaster />
          </TooltipProvider>
        </BrowserRouter>
      </div>
    </QueryClientProvider>
  );
}

export default App;
