# JSON 映射表单组件规划

> **文档状态：规划中**
>
> 本文从《框架设计规划》的共用组件原则中抽取 JSON 配置映射表单部分，作为后续支付、邮件、存储及其他 Provider 配置页面的统一实现依据。

## 1. 目标

建立一个由 JSON 定义驱动的后台表单组件，将配置定义、默认值、字段展示、输入控件、校验规则和敏感字段处理统一起来。

后续支付配置必须优先复用本组件，不在各 Provider 页面重复手写相同的字段布局、字段类型判断、表单值转换和 Secret 输入逻辑。

目标包括：

- 使用结构化 JSON 描述表单字段；
- 根据字段类型映射到已有的 shadcn-vue 表单组件；
- 支持文本、邮箱、URL、数字、密码、单选下拉、多选、开关和多行文本；
- 支持默认值、必填、占位符、说明、选项、最小值和最大值；
- 配置页面只负责读取定义、维护状态和提交业务输入；
- 服务端继续负责最终校验、序列化、权限和敏感信息处理。

## 2. 适用范围

第一阶段用于后台 Provider 配置：

- 支付渠道；
- 邮件邮局；
- 对象存储；
- 其他需要根据类型展示不同连接参数的后台配置。

不用于：

- 复杂的多步骤业务表单；
- 需要强交互联动的编辑器；
- 订单、商品等具有明显领域语义的实体表单；
- 服务端校验的替代品。

## 3. JSON 定义结构

表单定义应使用 TypeScript 类型约束的 JSON 对象，而不是在页面中散落条件判断。

```ts
type JsonFormValue = string | number | boolean | string[];
type JsonFormValues = Record<string, JsonFormValue>;

type JsonFormDefinition = {
  channel: string;
  provider: string;
  schemaVersion: number;
  title: string;
  fields: JsonFormField[];
  defaults: JsonFormValues;
};

type JsonFormField = {
  key: string;
  label: string;
  type: "text" | "email" | "number" | "password" | "url" | "switch" | "select" | "multi_select" | "textarea";
  required?: boolean;
  placeholder?: string;
  description?: string;
  secret?: boolean;
  min?: number;
  max?: number;
  options?: Array<{
    label: string;
    value: string;
  }>;
};
```

示例：

```ts
{
  channel: "PAYMENT",
  provider: "ALIPAY",
  schemaVersion: 1,
  title: "支付宝",
  defaults: {
    modes: ["web"],
    appId: "",
    notifyUrl: "",
    returnUrl: "",
  },
  fields: [
    {
      key: "modes",
      label: "支付模式",
      type: "multi_select",
      required: true,
      options: [
        { label: "网页支付", value: "web" },
        { label: "当面付", value: "face_to_face" },
      ],
      min: 1,
    },
    {
      key: "privateKey",
      label: "应用私钥",
      type: "textarea",
      required: true,
      secret: true,
      description: "敏感值保存后不再回显原文；留空表示保留当前值。",
    },
  ],
}
```

## 4. 字段映射规则

| JSON `type` | 前端组件 | 值类型 | 说明 |
| --- | --- | --- | --- |
| `text` | `Input` | `string` | 普通文本 |
| `email` | `Input type="email"` | `string` | 邮箱格式由服务端再次校验 |
| `url` | `Input type="url"` | `string` | 地址由服务端再次校验 |
| `number` | `Input type="number"` | `number` | 需要明确转换，不能把数字以字符串提交 |
| `password` | `Input type="password"` | `string` | 敏感原文仅在本次提交中传输；服务端保存到 D1，读取时只返回配置状态和掩码 |
| `select` | `Select` | `string` | 只能提交定义中声明的单个选项值 |
| `multi_select` | `Checkbox` 选项组或项目统一多选组件 | `string[]` | 只能提交定义中声明的选项值；至少一项等数量约束由服务端校验 |
| `switch` | `Switch` | `boolean` | 未设置时使用默认值 |
| `textarea` | `Textarea` | `string` | 用于多行文本和列表配置 |

组件映射必须集中在通用渲染层。页面不应为每种 Provider 重复编写 `v-if="field.type === ..."` 的完整结构；如确有特殊字段，应通过扩展字段定义或局部插槽处理。

## 5. 前端组件职责

建议提供以下组件边界：

- `JsonForm`：接收表单定义、当前值和敏感字段状态，渲染完整表单；
- `JsonFormField`：渲染单个字段，完成输入类型映射和基础展示；
- `JsonFormSection`：按配置分组展示字段；
- `JsonFormFooter`：统一处理取消、保存和 loading 状态。

组件应支持：

1. `definition`：当前 Provider 的 JSON 定义；
2. `values`：普通字段值；
3. `secrets`：已配置 Secret 的脱敏状态；
4. `secretUpdates`：本次新增、保留或清除的 Secret 操作；
5. `disabled` / `saving`：编辑中和提交中的交互状态；
6. `update:values`：向页面返回规范化后的表单值。

页面只保留领域相关行为，例如：

- 加载当前 Provider；
- 选择新增或编辑状态；
- 调用保存 Telefunc；
- 显示业务错误；
- 在不同支付 Provider 之间切换定义。

## 6. 敏感字段规则

`secret: true` 表示敏感配置字段。其真实值可以按各业务模块的存储策略保存，例如支付模块将私钥、Token、Webhook Secret 等真实值保存在 D1 `configJson`；但敏感原文不得回显，也不得写入页面响应、普通日志或 HTML。

编辑时必须区分三种状态：

- `keepExisting`：编辑已有配置时输入为空，保留数据库中的原敏感值；
- `value`：用户输入新的敏感值，由服务端替换旧值；新增配置时，必填敏感字段必须提交此状态；
- `clear`：明确清除已有敏感值；如果字段必填，服务端必须拒绝清除后的配置。

前端只显示“已配置（已脱敏）”等状态。服务端必须重新读取旧配置、验证字段和权限，并根据操作状态生成最终配置 JSON。通用表单不决定敏感值存入 D1、加密存储或外部 Secret；具体模块必须在自身设计中明确存储策略。

建议将敏感字段操作统一建模为：

```ts
type SecretUpdate =
  | { action: "keepExisting" }
  | { action: "value"; value: string }
  | { action: "clear" };

type SecretUpdates = Record<string, SecretUpdate>;
```

前端提交 `secretUpdates`，不把敏感值混入普通 `values`；服务端只接受定义中标记为 `secret: true` 的字段。

## 7. 校验与序列化

JSON 表单组件只负责基础交互和浏览器级提示，不能替代服务端校验。

服务端保存流程必须为：

1. 校验 `channel`、`provider` 和 `schemaVersion`；
2. 根据 Provider 定义校验字段是否存在、类型是否正确、值是否允许；
3. 对 URL、邮箱、端口、金额和枚举值执行领域校验；
4. 按业务模块的存储策略处理敏感字段；支付模块将真实值写入 D1 `configJson`，但不得写入响应或日志；
5. 使用结构化对象序列化为 `configJson`；
6. 保存前再次调用对应 Provider parser，确保读取和发送链路可以解析。

读取流程必须为：

1. 读取数据库中的 `configJson`；
2. 通过 Provider parser 解析；
3. 映射为普通字段值和脱敏 Secret 状态；
4. 返回表单组件可直接使用的数据；
5. 配置损坏时返回固定错误状态，不把原始 JSON 或异常信息展示给用户。

## 8. 支付模块接入要求

后续支付配置页面必须遵守以下要求：

- 支付 Provider 定义集中放在 `server/payment` 或对应的 Provider definitions 模块；
- 页面通过定义驱动表单，不复制邮件邮局页面的字段渲染代码；
- 支付宝私钥、证书、API 密钥等全部使用 `secret: true`，真实值由服务端保存到 D1 `configJson`；
- 支付模式、网关类型等单值枚举使用 `select`，可同时启用多个模式的配置使用 `multi_select`；
- 金额、端口、超时等数字字段使用 `number` 并在提交前保持数字类型；
- 支付回调地址、前台返回地址等使用 `url`；
- 保存、启用、删除和测试操作仍由服务端 `requireAdmin()` 保护；
- Provider 的实际解析和支付回调校验必须保留在服务端，不能由 JSON 定义取代。

## 9. 版本与扩展

`schemaVersion` 用于定义结构升级，不用于掩盖业务配置格式变化。

当字段定义发生不兼容变化时：

1. 增加新的 schema version；
2. 提供旧版本读取兼容或明确迁移；
3. 保持已有配置可读；
4. 通过测试覆盖旧版本和新版本；
5. 在本规划和框架改造进度中记录变更。

新增字段类型前必须确认现有 shadcn-vue 组件是否能表达该交互。只有确有必要时才新增通用字段类型，避免为单个 Provider 增加一次性组件。

## 10. 实施顺序

1. 抽取当前邮件邮局定义与字段渲染逻辑，形成通用 `JsonForm`；
2. 为邮件 API、SMTP 和 Cloudflare 配置补充渲染回归测试；
3. 接入支付 Provider，优先迁移支付宝配置；
4. 接入对象存储等其他结构化配置；
5. 删除各页面中重复的字段渲染和类型转换代码；
6. 更新 `docs/components.md` 与本规划的完成状态。

## 11. 验收标准

- 新增 Provider 只需增加 JSON 定义和服务端 parser，不复制完整表单页面；
- 所有字段类型映射到已有 shadcn-vue 组件；
- 敏感原文可以按模块策略进入配置存储，但不进入页面回显、数据库业务日志或普通响应；
- 桌面端和移动端表单布局稳定，弹窗使用官方 Dialog 组件；
- 服务端可拒绝未知字段、非法枚举、错误类型和无效敏感字段操作；
- 至少覆盖默认值、编辑回显、敏感值保留/清除、数字转换、多选白名单和校验失败测试。
