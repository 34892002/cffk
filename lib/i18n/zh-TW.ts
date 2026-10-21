import zhCN from "@/lib/i18n/zh-CN";

const traditionalCharacters: Record<string, string> = { "办": "辦", "与": "與", "业": "業", "个": "個", "为": "為", "乐": "樂", "书": "書", "买": "買", "乡": "鄉", "于": "於", "云": "雲", "仅": "僅", "从": "從", "们": "們", "会": "會", "传": "傳", "伤": "傷", "价": "價", "众": "眾", "优": "優", "体": "體", "余": "餘", "侧": "側", "偿": "償", "儿": "兒", "关": "關", "兴": "興", "养": "養", "内": "內", "册": "冊", "写": "寫", "冲": "衝", "决": "決", "况": "況", "冻": "凍", "净": "淨", "凭": "憑", "删": "刪", "别": "別", "剂": "劑", "务": "務", "动": "動", "劳": "勞", "势": "勢", "区": "區", "医": "醫", "华": "華", "协": "協", "单": "單", "卖": "賣", "厅": "廳", "历": "歷", "压": "壓", "发": "發", "变": "變", "叶": "葉", "号": "號", "后": "後", "吗": "嗎", "员": "員", "图": "圖", "场": "場", "块": "塊", "坏": "壞", "备": "備", "够": "夠", "头": "頭", "奖": "獎", "奥": "奧", "妇": "婦", "妈": "媽", "学": "學", "宁": "寧", "实": "實", "审": "審", "对": "對", "导": "導", "岁": "歲", "届": "屆", "属": "屬", "岗": "崗", "币": "幣", "帮": "幫", "广": "廣", "庆": "慶", "库": "庫", "应": "應", "废": "廢", "开": "開", "异": "異", "张": "張", "强": "強", "归": "歸", "当": "當", "录": "錄", "径": "徑", "忆": "憶", "怀": "懷", "态": "態", "总": "總", "恶": "惡", "惊": "驚", "想": "想", "户": "戶", "执": "執", "扩": "擴", "扫": "掃", "扬": "揚", "损": "損", "拥": "擁", "择": "擇", "挂": "掛", "换": "換", "摇": "搖", "摄": "攝", "收": "收", "效": "效", "数": "數", "断": "斷", "无": "無", "时": "時", "显": "顯", "暂": "暫", "术": "術", "机": "機", "权": "權", "条": "條", "来": "來", "杨": "楊", "极": "極", "构": "構", "样": "樣", "档": "檔", "检": "檢", "楼": "樓", "欢": "歡", "气": "氣", "汉": "漢", "沟": "溝", "没": "沒", "测": "測", "满": "滿", "灭": "滅", "灯": "燈", "点": "點", "炼": "煉", "热": "熱", "爱": "愛", "爷": "爺", "现": "現", "环": "環", "产": "產", "电": "電", "画": "畫", "畅": "暢", "疗": "療", "监": "監", "码": "碼", "础": "礎", "确": "確", "礼": "禮", "离": "離", "种": "種", "称": "稱", "积": "積", "税": "稅", "稳": "穩", "穷": "窮", "签": "簽", "简": "簡", "类": "類", "粮": "糧", "级": "級", "纷": "紛", "细": "細", "终": "終", "组": "組", "经": "經", "结": "結", "统": "統", "继": "繼", "绩": "績", "络": "絡", "绝": "絕", "给": "給", "续": "續", "编": "編", "缓": "緩", "网": "網", "罗": "羅", "罚": "罰", "联": "聯", "职": "職", "肠": "腸", "脸": "臉", "胜": "勝", "脑": "腦", "脚": "腳", "脱": "脫", "艺": "藝", "节": "節", "范": "範", "获": "獲", "蓝": "藍", "虑": "慮", "虚": "虛", "虽": "雖", "补": "補", "装": "裝", "复": "複", "规": "規", "觉": "覺", "触": "觸", "计": "計", "订": "訂", "认": "認", "讨": "討", "让": "讓", "议": "議", "证": "證", "评": "評", "识": "識", "该": "該", "详": "詳", "语": "語", "误": "誤", "说": "說", "请": "請", "读": "讀", "调": "調", "谢": "謝", "账": "帳", "贝": "貝", "购": "購", "费": "費", "资": "資", "赞": "讚", "赶": "趕", "转": "轉", "轮": "輪", "轻": "輕", "较": "較", "载": "載", "输": "輸", "边": "邊", "达": "達", "运": "運", "过": "過", "进": "進", "远": "遠", "违": "違", "连": "連", "选": "選", "递": "遞", "遗": "遺", "邮": "郵", "释": "釋", "鉴": "鑑", "钟": "鐘", "钱": "錢", "错": "錯", "键": "鍵", "长": "長", "门": "門", "闭": "閉", "问": "問", "间": "間", "阅": "閱", "队": "隊", "际": "際", "难": "難", "页": "頁", "顶": "頂", "项": "項", "顺": "順", "须": "須", "预": "預", "领": "領", "额": "額", "风": "風", "飞": "飛", "饰": "飾", "饼": "餅", "验": "驗", "马": "馬", "驶": "駛", "驾": "駕", "骂": "罵", "鱼": "魚", "鸡": "雞", "黄": "黃" };

function traditionalize<T>(value: T): T {
  if (typeof value === "string") return [...value].map((character) => traditionalCharacters[character] ?? character).join("") as T;
  if (Array.isArray(value)) return value.map(traditionalize) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, traditionalize(item)])) as T;
  return value;
}

const base = traditionalize(zhCN);

export default {
  ...base,
  languageName: "繁體中文",
  nav: { ...zhCN.nav, main: "主導覽", myOrders: "我的訂單", orderLookup: "訂單查詢", signIn: "登入", accountMenu: "{name} 的帳戶選單", account: "帳戶", accountSettings: "帳戶設定", signingOut: "登出中...", signOut: "登出", signOutFailed: "登出失敗，請稍後再試。", signedOut: "已登出。" },
  preferences: { language: "語言", theme: "主題", light: "淺色", dark: "深色" },
  storefront: { ...zhCN.storefront, fallbackSubtitle: "選擇商品後進入結帳流程", searchProducts: "搜尋商品名稱或關鍵字", products: "商品", relatedProducts: "找到 {count} 件相關商品", categories: "商品分類", all: "全部", stockAvailable: "庫存充足", stockCount: "庫存 {count}", outOfStock: "暫時缺貨", noProducts: "暫無可購買商品", noProductsDescription: "商品上架後會顯示在這裡。", contactSupport: "聯絡客服" },
  auth: {
    ...zhCN.auth,
    login: { ...zhCN.auth.login, tagline: "數位商品交易中心", headline: "下單、付款、收貨，\n一氣呵成。", description: "登入後查看訂單、取得歷史記錄，並管理帳戶資訊。", createOrder: "建立訂單", securePayment: "安全付款", delivery: "收貨", sslProtected: "網站受到 SSL 加密保護", welcomeBack: "歡迎回來", email: "電子郵件", password: "密碼", signingIn: "登入中...", signIn: "登入", createAccount: "註冊帳號", forgotPassword: "忘記密碼", emailInvalid: "請輸入有效電子郵件。", passwordRequired: "請輸入密碼。", captchaRequired: "請先完成人機驗證。", invalidCredentials: "電子郵件或密碼不正確。", requestFailed: "系統異常，請稍後再試。", captchaLoadFailed: "人機驗證載入失敗，請重新整理頁面後再試。", homeAriaLabel: "返回首頁" },
    forgotPassword: { ...zhCN.auth.forgotPassword, title: "找回密碼", description: "輸入註冊電子郵件，我們會傳送密碼重設連結。", email: "電子郵件", privacyNotice: "無論電子郵件是否已註冊，頁面都會顯示相同結果。", sending: "傳送中...", sendResetLink: "傳送重設連結", backToLogin: "返回登入", emailInvalid: "請輸入有效電子郵件。", emailTooLong: "電子郵件地址過長。", success: "如果該電子郵件已註冊，重設連結將傳送至該信箱。" },
    resetPassword: { ...base.auth.resetPassword, title: "重設密碼", description: "輸入新密碼以完成密碼重設。", password: "新密碼", confirmPassword: "確認新密碼", resetting: "重設中...", reset: "重設密碼", invalidTitle: "重設連結無效", invalidDescription: "重設連結缺少有效憑證或已失效，請重新申請。", backToForgotPassword: "返回找回密碼", passwordTooShort: "密碼至少需要 8 個字元。", passwordTooLong: "密碼不能超過 128 個字元。", passwordsMismatch: "兩次輸入的密碼不一致。", invalidOrExpired: "重設連結無效或已過期，請重新申請。", success: "密碼已重設，請重新登入。" },
    twoFactor: { ...base.auth.twoFactor, title: "雙重驗證", description: "請輸入驗證器 App 顯示的 6 位驗證碼以繼續登入。", code: "驗證碼", placeholder: "6 位驗證碼", verifying: "驗證中...", continue: "繼續登入", codeInvalid: "請輸入 6 位驗證碼。", codeExpired: "驗證碼無效或已過期。", failed: "驗證請求未能完成，請稍後再試。" },
    signup: { ...zhCN.auth.signup, unavailable: "暫時無法註冊", notInitialized: "網站尚未初始化，請稍後再試...", disabled: "本站尚未開啟註冊功能，如需協助請聯絡客服。", title: "註冊帳號", description: "建立帳號後即可使用電子郵件和密碼登入。", name: "暱稱", email: "電子郵件", password: "密碼", confirmPassword: "確認密碼", signingUp: "註冊中...", signUp: "註冊", haveAccount: "已有帳號？前往登入", nameRequired: "請輸入暱稱。", nameTooLong: "暱稱不能超過 100 個字元。", emailInvalid: "請輸入有效電子郵件。", emailTooLong: "電子郵件地址過長。", passwordTooShort: "密碼至少需要 8 個字元。", passwordTooLong: "密碼不能超過 128 個字元。", passwordsMismatch: "兩次輸入的密碼不一致。", failed: "註冊未能完成，請檢查填寫資訊或稍後再試。", submitted: "註冊申請已提交，請檢查電子郵件並完成驗證後登入。", requestFailed: "系統異常，請稍後再試。" },
    continue: { ...zhCN.auth.continue, redirecting: "正在完成登入..." },
  },
  checkout: {
    ...base.checkout,
    title: "訂單付款",
    orderNumber: "訂單號碼：{orderNo}",
    confirming: "正在確認訂單資訊...",
    notPayableTitle: "無法繼續付款",
    product: "商品",
    orderAmount: "訂單金額",
    scanPayment: "掃碼付款",
    paymentStatus: "付款狀態",
    exactAmountNotice: "請依此金額付款，金額必須完全一致",
    scanWithAlipay: "請使用支付寶掃碼付款",
    preparingQrCode: "正在準備收款 QR Code...",
    autoRefreshNotice: "付款完成後，頁面會自動更新訂單狀態。",
    notQrPayment: "該訂單不使用站內掃碼付款，請返回訂單頁面繼續付款。",
    paidTitle: "付款成功",
    closedTitle: "訂單已結束",
    paidDescription: "付款已確認，可返回訂單查看出貨進度。",
    closedDescription: "該訂單目前無法繼續付款。",
    loading: "正在載入訂單...",
    regenerating: "正在產生...",
    regenerateQrCode: "重新產生 QR Code",
    viewOrder: "查看訂單",
    errors: { ...base.checkout.errors, missingOrderNumber: "缺少訂單號碼，請返回訂單頁面重新選擇訂單。", localOrderNotFound: "未找到本機訂單，請返回訂單頁面使用訂單號碼和下單電子郵件查詢。", orderNotFound: "訂單不存在，或下單電子郵件不符。", accountOrderNotFound: "未找到目前帳戶下的該訂單。", qrCodeFailed: "暫時無法產生付款 QR Code，請稍後再試。" },
    paymentStatus: { unpaid: "待付款", paid: "已付款", failed: "付款失敗" },
  },
  paymentResult: {
    ...base.paymentResult,
    title: "付款結果",
    confirmingTitle: "確認付款結果",
    descriptionFallback: "支付平台回傳僅用於跳轉；訂單狀態以本站查詢和付款回呼為準。",
    queryFailedTitle: "查詢失敗",
    missingInfoTitle: "需要訂單資訊",
    orderStatus: "訂單狀態",
    orderNumber: "訂單號碼",
    amount: "金額",
    paymentStatus: "付款狀態",
    deliveryStatus: "出貨狀態",
    deliveryContents: "出貨內容",
    pendingDelivery: "付款通知可能仍在處理中，頁面會自動查詢訂單狀態。",
    openOrderLookup: "開啟訂單查詢",
    refreshing: "查詢中...",
    refresh: "重新整理狀態",
    hints: { ...base.paymentResult.hints, missingOrderNumber: "付款回跳缺少訂單號碼，請前往訂單查詢頁輸入訂單資訊。", guestOrderNotFound: "本機未找到該匿名訂單，請前往訂單查詢頁輸入下單電子郵件。", confirming: "正在確認訂單狀態。", accountOrderNotFound: "未找到目前帳戶下的該訂單。", orderNotFound: "訂單不存在，或下單電子郵件不符。", refreshFailed: "暫時無法確認訂單狀態，請稍後再試。" },
    status: { pending: "待付款", paid: "已付款", delivered: "已出貨", closed: "已關閉", failed: "失敗" },
    paymentStatus: { unpaid: "待付款", paid: "已付款", failed: "付款失敗" },
    deliveryStatus: { notDelivered: "未出貨", delivering: "出貨中", delivered: "已出貨", failed: "出貨失敗" },
  },
  guestOrders: {
    ...base.guestOrders,
    title: "訂單中心",
    description: "透過本機記錄、訂單號碼和下單電子郵件查詢或復原匿名訂單。",
    lookup: { ...base.guestOrders.lookup, title: "查詢匿名訂單", description: "使用訂單號碼和對應的下單電子郵件查詢詳情。", orderNumber: "訂單號碼", email: "下單電子郵件", failed: "查詢失敗", loading: "查詢中...", notFound: "訂單不存在，或下單電子郵件不符。", emailRequired: "請輸入該匿名訂單的下單電子郵件後查詢。" },
    recovery: { ...base.guestOrders.recovery, title: "電子郵件 OTP 復原", description: "驗證下單電子郵件後，以伺服器最近的匿名訂單原子覆寫該電子郵件的本機分組。", email: "下單電子郵件", code: "6 位驗證碼", changeEmail: "更換電子郵件", sendCode: "傳送驗證碼", verify: "驗證並復原", submitting: "處理中...", truncatedNote: "僅復原最近 50 個匿名訂單；更早記錄未寫入本機。", codeSent: "驗證碼已傳送，請檢查電子郵件。", sendFailed: "驗證碼傳送失敗，請稍後再試。", storageFailed: "驗證成功，但無法寫入瀏覽器儲存；原有本機訂單未變更。", verifyFailed: "驗證失敗，原有本機訂單未變更。", recovered: "已復原 {count} 個匿名訂單。", truncated: "僅復原最近 50 個匿名訂單，更早記錄未寫入本機。" },
    validation: { orderNumberRequired: "請輸入訂單號碼。", emailInvalid: "請輸入有效的下單電子郵件。", codeInvalid: "請輸入 6 位數字驗證碼。" },
    back: "返回",
    backAriaLabel: "返回匿名訂單列表",
    detail: { ...base.guestOrders.detail, title: "訂單詳情", quantity: "數量", amount: "金額", paymentStatus: "付款狀態", deliveryStatus: "出貨狀態", deliveryContents: "出貨內容", awaitingDeliveryTitle: "等待出貨", awaitingDeliveryDescription: "訂單已付款，出貨作業正在處理中。" },
    payment: { ...base.guestOrders.payment, goToPayment: "前往付款", generating: "正在產生付款資訊...", resume: "繼續付款", generateFailed: "暫時無法產生付款資訊，請稍後再試。", resumeFailed: "暫時無法繼續付款，請稍後再試。" },
    list: { ...base.guestOrders.list, eyebrow: "選擇或查詢訂單", title: "匿名訂單列表", description: "本機儲存的訂單按下單電子郵件分組。選擇訂單後可查看詳情或繼續付款。", emptyTitle: "暫無本機匿名訂單", emptyDescription: "請使用左側表單按訂單號碼和下單電子郵件查詢，或透過電子郵件 OTP 復原訂單記錄。", deleteAll: "刪除全部匿名訂單", deleteGroup: "刪除 {email} 的訂單" },
    clear: { ...base.guestOrders.clear, titleOne: "刪除 {email} 的匿名訂單？", titleAll: "刪除全部匿名訂單？", descriptionOne: "此操作只會刪除該電子郵件分組，不影響其他電子郵件的本機記錄。操作無法復原。", descriptionAll: "此操作會永久刪除目前瀏覽器儲存的全部匿名訂單記錄。操作無法復原。", cancel: "取消", confirm: "確認刪除", storageFailed: "無法刪除本機匿名訂單，請檢查瀏覽器儲存權限。", deletedAll: "全部本機匿名訂單已刪除。", deletedOne: "該電子郵件的本機匿名訂單已刪除。" },
    status: { pending: "待付款", paid: "已付款", delivered: "已出貨", closed: "已關閉", failed: "失敗" },
    paymentStatus: { unpaid: "待付款", paid: "已付款", failed: "付款失敗" },
    deliveryStatus: { notDelivered: "未出貨", delivering: "出貨中", delivered: "已出貨", failed: "出貨失敗" },
  },
} as unknown as typeof zhCN;
