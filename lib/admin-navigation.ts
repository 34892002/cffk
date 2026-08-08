export type AdminPageMeta = {
  title: string;
  path: string;
  pageTitle: string;
  description: string;
};

export type AdminNavigationModule = AdminPageMeta & {
  items: readonly AdminPageMeta[];
};

export type AdminNavigationItem = AdminPageMeta | AdminNavigationModule;

export type AdminNavigationGroup = {
  title: string;
  items: readonly AdminNavigationItem[];
};

export function isNavigationModule(item: AdminNavigationItem): item is AdminNavigationModule {
  return "items" in item;
}

const emailDescription = "管理邮件 Provider、发送统计和模板。";

export const adminPages = {
  account: {
    title: "账户设置",
    path: "/account",
    pageTitle: "账户设置",
    description: "修改当前管理员的昵称、邮箱和登录密码。",
  },
  dashboard: {
    title: "面板",
    path: "/dash",
    pageTitle: "运营面板",
    description: "当前店铺的真实运营汇总。",
  },
  categories: {
    title: "分类管理",
    path: "/catalog/categories",
    pageTitle: "分类管理",
    description: "管理商品分类、排序和启用状态。",
  },
  products: {
    title: "商品列表",
    path: "/catalog/products",
    pageTitle: "商品管理",
    description: "管理商品价格、分类、上下架状态和购买限制。",
  },
  cards: {
    title: "卡密管理",
    path: "/catalog/cards",
    pageTitle: "卡密管理",
    description: "管理自动发货商品的卡密库存、批次与发售状态。",
  },
  discounts: {
    title: "折扣码管理",
    path: "/catalog/discounts",
    pageTitle: "优惠码管理",
    description: "创建优惠规则、限制使用次数和适用商品。金额以分保存。",
  },
  orders: {
    title: "订单管理",
    path: "/orders",
    pageTitle: "订单管理",
    description: "查看订单、关闭未支付订单，并处理人工、物流及自动交付恢复。",
  },
  pushConfig: {
    title: "推送配置",
    path: "/push/config",
    pageTitle: "消息推送设置",
    description: "配置订单事件的推送对象和可用渠道。",
  },
  pushLogs: {
    title: "发送日志",
    path: "/push/history",
    pageTitle: "推送发送日志",
    description: "记录邮件、企业微信和 Telegram 等全部渠道的发送结果。",
  },
  email: {
    title: "电子邮件",
    path: "/push/email",
    pageTitle: "电子邮件",
    description: emailDescription,
  },
  mailPostOffice: {
    title: "通道配置",
    path: "/push/email/post-office",
    pageTitle: "邮件通道配置",
    description: "配置邮件 Provider，并发送测试邮件。",
  },
  mailTemplates: {
    title: "邮件模板",
    path: "/push/email/templates",
    pageTitle: "邮件模板",
    description: "管理各邮件场景的主题、正文和可用变量。",
  },
  wecom: {
    title: "企业微信",
    path: "/push/wecom",
    pageTitle: "企业微信通知配置",
    description: "配置企业微信机器人通知渠道。",
  },
  telegram: {
    title: "Telegram",
    path: "/push/telegram",
    pageTitle: "Telegram 通知配置",
    description: "配置 Telegram Bot 通知渠道。",
  },
  payments: {
    title: "支付配置",
    path: "/system/payments",
    pageTitle: "支付配置",
    description: "管理支付渠道和支付日志。",
  },
  paymentLogs: {
    title: "支付日志",
    path: "/system/payments/payment-logs",
    pageTitle: "支付日志",
    description: "查看已脱敏的支付事件与验证结果。",
  },
  media: {
    title: "媒体存储",
    path: "/system/media",
    pageTitle: "媒体存储配置",
    description: "配置 S3 兼容存储。访问密钥仅通过 Worker Secret 引用。",
  },
  settings: {
    title: "站点配置",
    path: "/system/settings",
    pageTitle: "站点配置",
    description: "管理公开商城、站点资源和默认 SEO 配置。"
  },
  security: {
    title: "安全配置",
    path: "/system/security",
    pageTitle: "安全配置",
    description: "管理站点安全配置。",
  },

  tasks: {
    title: "任务",
    path: "/system/tasks",
    pageTitle: "系统任务",
    description: "系统任务功能尚未启用，后台不会展示模拟任务数据。",
  },
} as const satisfies Record<string, AdminPageMeta>;

export const adminNavigation = {
  dashboard: adminPages.dashboard,
  product: {
    title: "商品管理",
    items: [adminPages.categories, adminPages.products, adminPages.cards, adminPages.discounts],
  },
  orders: adminPages.orders,
  push: {
    title: "推送管理",
    items: [
      adminPages.pushConfig,
      adminPages.pushLogs,
      { ...adminPages.email, items: [adminPages.mailPostOffice, adminPages.mailTemplates] },
      adminPages.wecom,
      adminPages.telegram,
    ],
  },
  system: {
    title: "系统配置",
    items: [adminPages.payments, adminPages.media, adminPages.settings, adminPages.security, adminPages.tasks],
  },

} as const satisfies Record<string, AdminPageMeta | AdminNavigationGroup>;

const navigationGroups: readonly AdminNavigationGroup[] = [
  adminNavigation.product,
  adminNavigation.push,
  adminNavigation.system,
];

const allAdminPages = Object.values(adminPages) as readonly AdminPageMeta[];

export function getAdminPageMeta(pathname: string, basePath: string) {
  const routePath = pathname.slice(basePath.length).replace(/\/$/, "") || "/";
  return allAdminPages.find((page) => page.path === routePath);
}

export function isAdminNavigationItemActive(pathname: string, basePath: string, item: AdminNavigationItem) {
  const target = `${basePath}${item.path}`;
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function getAdminBreadcrumb(pathname: string, basePath: string) {
  for (const group of navigationGroups) {
    for (const item of group.items) {
      if (!isAdminNavigationItemActive(pathname, basePath, item)) continue;
      if (isNavigationModule(item)) {
        const child = item.items.find((candidate) => isAdminNavigationItemActive(pathname, basePath, candidate));
        return { titles: child ? [group.title, item.title, child.title] : [group.title, item.title] };
      }
      return { titles: [group.title, item.title] };
    }
  }

  const standaloneItems = [adminNavigation.dashboard, adminNavigation.orders, adminPages.account];
  const standalone = standaloneItems.find((item) => isAdminNavigationItemActive(pathname, basePath, item));
  if (standalone) return { titles: [standalone.title] };

  const page = getAdminPageMeta(pathname, basePath);
  return { titles: [page?.title ?? "管理后台"] };
}
