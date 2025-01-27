import info from "@/lib/info.json";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem
} from "@/components/ui/sidebar";
import { NavLink } from "react-router";
import { Book, Cog } from "lucide-react";
import ConnectionStatus from "./connection-status";

export function AppSidebar() {
    return (
        <Sidebar>
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <NavLink to="/">
                                <img
                                    src="/bork.svg"
                                    width="100%"
                                    height="100%"
                                    className="size-7 bg-white rounded-lg"
                                />

                                <div className="flex flex-col gap-0.5 leading-none">
                                    <span className="font-semibold">
                                        Bork
                                    </span>
                                    <span className="">v{info?.version}</span>
                                </div>
                            </NavLink>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent />
            <SidebarFooter>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <NavLink
                            to="https://bork.institute/"
                            target="_blank"
                        >
                            <SidebarMenuButton>
                                <Book /> Website
                            </SidebarMenuButton>
                        </NavLink>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton disabled>
                            <Cog /> Settings
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <ConnectionStatus />
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}
