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
              <SidebarMenuButton as-child :is-active="isActive('/dash')">
                <a :href="basePath + '/dash'"><LayoutDashboardIcon /><span>面板</span></a>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Collapsible default-open class="group/collapsible">
                <CollapsibleTrigger as-child>
                  <SidebarMenuButton :is-active="isProductActive">
                    <PackageIcon />
                    <span>商品管理</span>
                    <ChevronRightIcon class="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem v-for="item in productItems" :key="item.title">
                      <SidebarMenuSubButton as-child :is-active="isActive(item.path)">
                        <a :href="basePath + item.path"><span>{{ item.title }}</span></a>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton as-child :is-active="isActive('/orders')">
                <a :href="basePath + '/orders'"><ClipboardListIcon /><span>订单管理</span></a>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <Collapsible default-open class="group/collapsible">
                <CollapsibleTrigger as-child>
                  <SidebarMenuButton>
                    <MailIcon />
                    <span>邮件配置</span>
                    <ChevronRightIcon class="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem v-for="item in mailItems" :key="item.title">
                      <SidebarMenuSubButton as-child :is-active="isActive(item.path)">
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
                  <SidebarMenuButton :is-active="isSystemActive">
                    <SettingsIcon />
                    <span>系统配置</span>
                    <ChevronRightIcon class="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem v-for="item in systemItems" :key="item.title">
                      <SidebarMenuSubButton as-child :is-active="isActive(item.path)">
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
                  <SidebarMenuButton :is-active="isUserActive">
                    <UsersIcon />
                    <span>用户管理</span>
                    <ChevronRightIcon class="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem v-for="item in userItems" :key="item.title">
                      <SidebarMenuSubButton as-child :is-active="isActive(item.path)">
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
                <Avatar class="size-8 rounded-lg">
                  <AvatarFallback class="rounded-lg">{{ userInitials }}</AvatarFallback>
                </Avatar>
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
                <DropdownMenuItem @select="onSignOut">
                  <LogOutIcon data-icon="inline-start" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  </Sidebar>
</template>

<script lang="ts" setup>
import {
  CollapsibleContent,
  CollapsibleRoot as Collapsible,
  CollapsibleTrigger,
} from "reka-ui";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { ChevronRightIcon, ChevronUpIcon, ClipboardListIcon, KeyRoundIcon, LayoutDashboardIcon, LogOutIcon, MailIcon, PackageIcon, SettingsIcon, UsersIcon } from "@lucide/vue";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { navigate } from "vike/client/router";
import { computed } from "vue";
import { usePageContext } from "vike-vue/usePageContext";

const pageContext = usePageContext();
const basePath = computed(() => `/${pageContext.routeParams.adminPath}`);
const currentUser = computed(() => pageContext.user ?? null);
const currentUserName = computed(() => currentUser.value?.name?.trim() || currentUser.value?.email || "管理员");
const currentUserEmail = computed(() => currentUser.value?.email || "当前登录账号");
const userInitials = computed(() => currentUserName.value.slice(0, 2).toUpperCase());
const productItems = [
  // 分类和商品当前由同一个 catalog 页面维护，保留菜单语义以便后续拆页。
  { title: "分类管理", path: "/categories" },
  { title: "商品列表", path: "/products" },
  { title: "卡密管理", path: "/cards" },
  { title: "折扣码管理", path: "/discounts" },
];
const mailItems = [
  { title: "邮件统计", path: "/mail/overview" },
  { title: "通道配置", path: "/mail/post-office" },
  { title: "发送日志", path: "/mail/history" },
  { title: "邮件模板", path: "/mail/templates" },
];
const systemItems = [
  { title: "支付渠道", path: "/payments" },
  { title: "媒体存储", path: "/media" },
  { title: "站点配置", path: "/settings" },
  { title: "安全配置", path: "/security" },
];
const userItems = [
  { title: "管理员账户", path: "/admins" },
];
const isProductActive = computed(() => productItems.some((item) => isActive(item.path)));
const isSystemActive = computed(() => systemItems.some((item) => isActive(item.path)));
const isUserActive = computed(() => userItems.some((item) => isActive(item.path)));

function isActive(path: string) {
  return pageContext.urlPathname === basePath.value + path;
}

async function onSignOut() {
  await authClient.signOut();
  await navigate("/");
}
</script>
