<template>
  <Sidebar variant="inset" collapsible="icon">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg">
            <div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <KeyRoundIcon />
            </div>
            <div class="grid flex-1 text-left text-sm leading-tight">
              <span class="truncate font-semibold">CFFK</span>
              <span class="truncate text-xs">管理后台</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>管理</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton as-child :is-active="isItemActive(adminNavigation.dashboard)">
                <a :href="basePath + adminNavigation.dashboard.path"><LayoutDashboardIcon /><span>{{ adminNavigation.dashboard.title }}</span></a>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <Collapsible default-open class="group/collapsible">
                <CollapsibleTrigger as-child>
                  <SidebarMenuButton :is-active="isGroupActive(adminNavigation.product)">
                    <PackageIcon />
                    <span>{{ adminNavigation.product.title }}</span>
                    <ChevronRightIcon class="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem v-for="item in adminNavigation.product.items" :key="item.title">
                      <SidebarMenuSubButton as-child :is-active="isItemActive(item)">
                        <a :href="basePath + item.path"><span>{{ item.title }}</span></a>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton as-child :is-active="isItemActive(adminNavigation.orders)">
                <a :href="basePath + adminNavigation.orders.path"><ClipboardListIcon /><span>{{ adminNavigation.orders.title }}</span></a>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <Collapsible default-open class="group/collapsible">
                <CollapsibleTrigger as-child>
                  <SidebarMenuButton :is-active="isGroupActive(adminNavigation.push)">
                    <BellIcon />
                    <span>{{ adminNavigation.push.title }}</span>
                    <ChevronRightIcon class="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem v-for="item in adminNavigation.push.items" :key="item.title">
                      <SidebarMenuSubButton as-child :is-active="isItemActive(item)">
                        <a :href="basePath + item.path"><span>{{ item.title }}</span></a>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <Collapsible default-open class="group/collapsible">
                <CollapsibleTrigger as-child>
                  <SidebarMenuButton :is-active="isGroupActive(adminNavigation.system)">
                    <SettingsIcon />
                    <span>{{ adminNavigation.system.title }}</span>
                    <ChevronRightIcon class="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem v-for="item in adminNavigation.system.items" :key="item.title">
                      <SidebarMenuSubButton as-child :is-active="isItemActive(item)">
                        <a :href="basePath + item.path"><span>{{ item.title }}</span></a>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <Collapsible default-open class="group/collapsible">
                <CollapsibleTrigger as-child>
                  <SidebarMenuButton :is-active="isGroupActive(adminNavigation.user)">
                    <UsersIcon />
                    <span>{{ adminNavigation.user.title }}</span>
                    <ChevronRightIcon class="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem v-for="item in adminNavigation.user.items" :key="item.title">
                      <SidebarMenuSubButton as-child :is-active="isItemActive(item)">
                        <a :href="basePath + item.path"><span>{{ item.title }}</span></a>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <SidebarMenuButton size="lg" class="cursor-pointer data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                <Avatar class="size-8 rounded-lg"><AvatarFallback class="rounded-lg">{{ userInitials }}</AvatarFallback></Avatar>
                <div class="grid flex-1 text-left text-sm leading-tight">
                  <span class="truncate font-medium">{{ currentUserName }}</span>
                  <span class="truncate text-xs">{{ currentUserEmail }}</span>
                </div>
                <ChevronUpIcon class="ml-auto" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" :side-offset="8" class="w-48">
              <DropdownMenuLabel>{{ currentUserName }}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem @select="onSignOut"><LogOutIcon data-icon="inline-start" />退出登录</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  </Sidebar>
</template>

<script lang="ts" setup>
import { CollapsibleContent, CollapsibleRoot as Collapsible, CollapsibleTrigger } from "reka-ui";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { adminNavigation, isAdminNavigationItemActive, type AdminNavigationGroup, type AdminNavigationItem } from "@/lib/admin-navigation";
import { BellIcon, ChevronRightIcon, ChevronUpIcon, ClipboardListIcon, KeyRoundIcon, LayoutDashboardIcon, LogOutIcon, PackageIcon, SettingsIcon, UsersIcon } from "@lucide/vue";
import { navigate } from "vike/client/router";
import { computed } from "vue";
import { usePageContext } from "vike-vue/usePageContext";

const pageContext = usePageContext();
const basePath = computed(() => `/${pageContext.routeParams.adminPath}`);
const currentUser = computed(() => pageContext.user ?? null);
const currentUserName = computed(() => currentUser.value?.name?.trim() || currentUser.value?.email || "管理员");
const currentUserEmail = computed(() => currentUser.value?.email || "当前登录账号");
const userInitials = computed(() => currentUserName.value.slice(0, 2).toUpperCase());

function isItemActive(item: AdminNavigationItem) {
  return isAdminNavigationItemActive(pageContext.urlPathname, basePath.value, item);
}


function isGroupActive(group: AdminNavigationGroup) {
  return group.items.some((item) => isItemActive(item));
}

async function onSignOut() {
  await authClient.signOut();
  await navigate("/");
}
</script>
