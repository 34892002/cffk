<template>
  <Sidebar variant="inset" collapsible="icon">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <SidebarMenuButton size="lg" class="h-14 cursor-pointer data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                <img :src="logoUrl" alt="CFFK Logo" class="aspect-square size-10 rounded-lg object-contain" />
                <div class="grid flex-1 text-left leading-tight">
                  <span class="truncate text-sm font-semibold">CFFK发卡</span>
                  <span class="truncate text-xs">系统管理后台</span>
                </div>
                <ChevronsUpDownIcon class="ml-auto" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" :side-offset="8" class="w-64">
              <DropdownMenuLabel>关于 CFFK 发卡</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem @select.prevent="checkUpdate">
                  <InfoIcon data-icon="inline-start" />
                  <span>当前版本 v{{ appVersion }}</span>
                  <span class="ml-auto text-xs text-muted-foreground">{{ updateStatus }}</span>
                </DropdownMenuItem>
                <DropdownMenuItem as-child>
                  <a href="https://github.com/34892002/cffk" target="_blank" rel="noopener noreferrer">
                    <ExternalLinkIcon data-icon="inline-start" />
                    GitHub 仓库
                  </a>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
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
              <Collapsible default-open class="group/collapsible">
                <CollapsibleTrigger as-child>
                  <SidebarMenuButton :is-active="isGroupActive(adminNavigation.suppliers)"><KeyRoundIcon /><span>{{ adminNavigation.suppliers.title }}</span><ChevronRightIcon class="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" /></SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent><SidebarMenuSub><SidebarMenuSubItem v-for="item in adminNavigation.suppliers.items" :key="item.title"><SidebarMenuSubButton as-child :is-active="isItemActive(item)"><a :href="basePath + item.path"><span>{{ item.title }}</span></a></SidebarMenuSubButton></SidebarMenuSubItem></SidebarMenuSub></CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton as-child :is-active="isItemActive(adminNavigation.orders)">
                <a :href="basePath + adminNavigation.orders.path"><ClipboardListIcon /><span>{{ adminNavigation.orders.title }}</span></a>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton as-child :is-active="isItemActive(adminNavigation.users)">
                <a :href="basePath + adminNavigation.users.path"><UsersIcon /><span>{{ adminNavigation.users.title }}</span></a>
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
                <DropdownMenuItem as-child>
                  <a :href="basePath + adminPages.account.path"><UserRoundCogIcon data-icon="inline-start" />账户设置</a>
                </DropdownMenuItem>
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
import { adminNavigation, adminPages, isAdminNavigationItemActive, type AdminNavigationGroup, type AdminNavigationItem } from "@/lib/admin-navigation";
import { BellIcon, ChevronRightIcon, ChevronUpIcon, ChevronsUpDownIcon, ClipboardListIcon, ExternalLinkIcon, InfoIcon, KeyRoundIcon, LayoutDashboardIcon, LogOutIcon, PackageIcon, SettingsIcon, UserRoundCogIcon, UsersIcon } from "@lucide/vue";
import logoUrl from "@/assets/logo.svg?url";
import { navigate } from "vike/client/router";
import { computed, ref } from "vue";
import { usePageContext } from "vike-vue/usePageContext";

const pageContext = usePageContext();
const basePath = computed(() => `/${pageContext.routeParams.adminPath}`);
const currentUser = computed(() => pageContext.user ?? null);
const currentUserName = computed(() => currentUser.value?.name?.trim() || currentUser.value?.email || "管理员");
const currentUserEmail = computed(() => currentUser.value?.email || "当前登录账号");
const userInitials = computed(() => currentUserName.value.slice(0, 2).toUpperCase());
// eslint-disable-next-line no-undef
const appVersion = __APP_VERSION__;
const updateStatus = ref("检查更新");
const lastCheckTime = ref(0);
const UPDATE_COOLDOWN_MS = 10 * 60 * 1000;

async function checkUpdate() {
  const now = Date.now();
  if (now - lastCheckTime.value < UPDATE_COOLDOWN_MS) {
    updateStatus.value = "请稍后";
    return;
  }

  lastCheckTime.value = now;
  updateStatus.value = "检查中...";
  try {
    const response = await fetch("https://raw.githubusercontent.com/34892002/cffk/main/package.json");
    const packageInfo = await response.json() as { version?: string };
    if (!response.ok || !packageInfo.version) throw new Error("invalid response");
    updateStatus.value = compareVersions(appVersion, packageInfo.version) >= 0 ? "已是最新" : `最新 v${packageInfo.version}`;
  } catch {
    updateStatus.value = "检查失败";
  }
}

function compareVersions(current: string, latest: string) {
  const currentParts = current.split(".").map(Number);
  const latestParts = latest.split(".").map(Number);
  const length = Math.max(currentParts.length, latestParts.length);
  for (let index = 0; index < length; index += 1) {
    const currentPart = currentParts[index] || 0;
    const latestPart = latestParts[index] || 0;
    if (currentPart !== latestPart) return currentPart > latestPart ? 1 : -1;
  }
  return 0;
}

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
