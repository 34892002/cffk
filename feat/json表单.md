# JSON 配置表单与 Provider 协议

> **文档状态：已采用**

## 1. 目标

项目只维护一套 JSON 表单模型。支付、邮件、对象存储及后续 Provider 共用相同的字段定义、提交规则和敏感字段处理，不再为不同模块维护 `secrets`、`secretUpdates`、`keepExisting` 等额外协议。

系统中的 JSON 分为两类，职责不能混用：

1. `JsonFormDefinition`：控制后台表单、提交白名单、类型、默认值、必填和敏感字段。
2. Provider 协议定义：描述第三方请求或回调的字段名称、映射和基础数据结构。

签名、验签、金额核对、商户归属、支付状态判断和邮件发送行为仍由 Provider adapter 代码实现。协议 JSON 不执行任意代码，也不取代领域安全校验。

## 2. 统一表单定义

```ts
type JsonFormInputValue = string | number | boolean | string[];
type JsonFormSubmitValue = JsonFormInputValue | null;
type JsonFormValues = Record<string, JsonFormInputValue>;
type JsonFormSubmitValues = Record<string, JsonFormSubmitValue>;

type JsonFormDefinition = {
  provider: string;
  schemaVersion: number;
  title: string;
  fields: JsonFormFieldDefinition[];
  defaults: JsonFormValues;
};

type JsonFormFieldDefinition = {
  key: string;
  label: string;
  type:
    | "text"
    | "email"
    | "number"
    | "password"
    | "url"
    | "switch"
    | "select"
    | "multi_select"
    | "textarea";
  required?: boolean;
  placeholder?: string;
  description?: string;
  secret?: boolean;
  min?: number;
  max?: number;
  options?: Array<{ label: string; value: string }>;
};
```

`fields` 是服务端允许提交的字段白名单，也是服务端基础约束来源。浏览器提交定义之外的字段时必须拒绝；`required`、值类型、`min`、`max`、`options`、邮箱和 HTTP(S) URL 约束也必须在服务端执行，不能只用于渲染控件。Provider parser 在此基础上继续执行密钥格式、商户规则等领域校验。

## 3. 示例

```ts
const smtpDefinition: JsonFormDefinition = {
  provider: "SMTP",
  schemaVersion: 1,
  title: "SMTP",
  defaults: {
    host: "",
    port: 587,
    secure: false,
    username: "",
    from: "",
  },
  fields: [
    { key: "host", label: "SMTP Host", type: "text", required: true },
    { key: "port", label: "SMTP Port", type: "number", required: true, min: 1, max: 65535 },
    { key: "secure", label: "使用 SMTPS / SSL", type: "switch" },
    { key: "username", label: "SMTP 用户名", type: "text", required: true },
    {
      key: "password",
      label: "SMTP 密码 / 授权码",
      type: "password",
      required: true,
      secret: true,
    },
    { key: "from", label: "发件邮箱", type: "email", required: true },
  ],
};
```

同一个定义同时用于：

- 渲染控件；
- 初始化默认值；
- 规范化数字等浏览器输入；
- 限制服务端可接受字段；
- 标识敏感字段；
- 生成安全的编辑回显；
- 合并本次提交和 D1 旧配置。

## 4. 唯一提交协议

页面只提交一个 `values` 对象，不提交第二套 Secret 操作对象：

```ts
{
  provider: "SMTP",
  values: {
    host: "smtp.example.com",
    port: 465,
    secure: true,
    username: "sender@example.com",
    password: "new-credential",
    from: "sender@example.com"
  }
}
```

对于 `secret: true` 字段，统一使用以下语义：

| 提交状态 | 行为 |
| --- | --- |
| 字段不存在 | 保留 D1 中的旧值 |
| 非空字符串 | 替换 D1 中的旧值 |
| `null` | 明确清除旧值 |
| 空字符串 | 前端提交构造器删除该字段，即保留旧值 |
| 其他类型 | 服务端拒绝 |

普通字段按表单当前值提交。`schemaVersion` 由服务端根据 definition 写入，不由浏览器控制。

必填 Secret 被清除后，服务端 definition 校验或最终 Provider parser 必须拒绝该配置。新建配置没有必填 Secret 时同样拒绝保存。通用模型保留 `null` 语义，是为了支持未来的可选 Secret；当前邮件和支付的凭据字段全部必填，因此页面不显示无法成功保存的“清除凭据”操作，只允许留空保留或填写新值替换。

## 5. 读取与脱敏

D1 `configJson` 保存 Provider 运行所需的完整配置，包括真实 API Key、SMTP 授权码或支付私钥。配置读取接口绝不能把这些原文返回浏览器。

服务端根据 `secret: true` 自动生成安全响应：

```json
{
  "values": {
    "host": "smtp.example.com",
    "port": 465,
    "secure": true,
    "username": "sender@example.com",
    "from": "sender@example.com"
  },
  "configuredSecrets": ["password"]
}
```

不返回掩码字符串，因为掩码本身不是配置值。前端只需根据 `configuredSecrets.includes(field.key)` 显示“已配置”。

敏感原文不得进入：

- Telefunc 配置读取响应；
- HTML 和页面数据；
- 普通日志；
- 数据库业务日志；
- 错误消息。

## 6. 保存流程

服务端保存流程固定为：

1. 根据 `provider` 获取 `JsonFormDefinition`。
2. 解析现有 D1 `configJson`；损坏的旧 JSON 可由一份完整新提交替换。
3. 拒绝 definition 未声明的提交字段。
4. 普通字段使用本次提交值。
5. Secret 按“缺失保留、字符串替换、`null` 清除”合并。
6. 服务端写入固定 `schemaVersion`。
7. 调用统一 definition 校验执行必填、类型、范围、选项、URL 和邮箱校验。
8. 调用 Provider parser 执行密钥格式、商户规则等领域校验。
9. 两层校验通过后序列化并写入 D1。

配置不完整时不能启用或测试，但已经启用的损坏配置必须允许直接停用。页面应显示“配置不完整”，不能等到实际发送或支付时才暴露 parser 错误。若 D1 内容仍是合法 JSON 对象，读取层可以从 definition 白名单中恢复普通字段和 `configuredSecrets`，便于修复；语法损坏的 JSON 无法安全恢复 Secret，必须重新填写。

管理读取、公开 Provider 列表、创建请求、回调和主动查询必须调用同一个 strict parser。不能出现“管理保存严格、运行时读取宽松”的两套有效性标准。

## 7. 控件映射

| `type` | 前端组件 | 值类型 |
| --- | --- | --- |
| `text` | `Input` | `string` |
| `email` | `Input type="email"` | `string` |
| `url` | `Input type="url"` | `string` |
| `number` | `Input type="number"` | `number` |
| `password` | `Input type="password"` | `string` |
| `select` | `Select` | `string` |
| `multi_select` | `Checkbox` 选项组 | `string[]` |
| `switch` | `Switch` | `boolean` |
| `textarea` | `Textarea` | `string` |

生成表单在提交前必须通过共享的 `getJsonFormErrors()` 直接执行 definition 中的 `required`、类型、范围、选项、邮箱和 URL 约束，并把错误显示到对应控件。服务端仍使用相同 definition 再校验一次，不能依赖可绕过的浏览器校验。专用展示控件（例如支付回调和返回地址）可以替换默认输入外观，但不能跳过 definition 校验。

## 8. 第三方协议 JSON

表单 definition 描述“管理员需要填写什么”，Provider 协议描述“第三方接口发送或返回什么”。二者是不同的数据结构。

可配置的协议元数据包括：

```ts
type ProviderProtocolDefinition = {
  request?: {
    method: "GET" | "POST";
    contentType: "json" | "form";
    fieldMap: Record<string, string>;
  };
  callback?: {
    contentType: "json" | "form" | "query";
    fieldMap: Record<string, string>;
    requiredFields: string[];
  };
};
```

例如 `fieldMap` 可以声明第三方的 `out_trade_no` 对应项目内部 `orderNo`。但以下逻辑必须保留在 adapter 代码中：

- 签名生成与验签；
- 原始请求体校验；
- 金额、币种、应用 ID 和商户 ID 核对；
- 第三方状态到内部状态的安全转换；
- 防重放、幂等和订单状态机；
- Provider 特有的网络错误与重试策略。

只有多个 Provider 确实共享相同映射方式时才引入协议 JSON。不能为了无代码适配而创建可执行表达式 DSL。

## 9. 实现位置

统一类型和纯函数位于 `lib/json-form-values.ts`：

- `normalizeJsonFormInputValue()`：浏览器输入规范化；
- `getJsonFormErrors()`：根据同一 definition 生成前端字段错误；
- `buildJsonFormSubmission()`：生成唯一的 `values` 提交对象；
- `mergeJsonFormValues()`：服务端白名单校验与 Secret 合并；
- `validateJsonFormValues()`：根据 definition 执行必填、类型、范围、选项、邮箱和 URL 校验；
- `redactJsonFormValues()`：读取时移除 Secret 原文并生成 `configuredSecrets`。

邮件和支付必须复用 `JsonFormFields` 和这些函数。Provider definition 可以分别维护在各自 registry 中，但字段渲染、前端校验、字段类型和提交语义不得分叉。

## 10. 测试要求

`tests/json-form-values.test.ts` 必须覆盖：

- 数字输入不会把空值转换成 `0`；
- 未知字段被拒绝；
- Secret 原文不会出现在读取结果；
- Secret 字段缺失时保留旧值；
- 非空字符串替换旧值；
- `null` 清除旧值；
- 非字符串 Secret 被拒绝；
- required、类型、数值范围、select / multi-select 选项、邮箱和 URL 约束被前端共享校验和服务端校验执行；
- 已保存 Secret 留空时前端允许保留，显式清除必填 Secret 时前后端均拒绝；
- 页面提交构造器不会生成 Secret 操作对象。

各 Provider 测试继续覆盖 parser、最终 `configJson` 和领域规则，不重复实现通用 Secret 状态机测试。

## 11. 验收标准

- 项目只有一套 JSON 表单字段类型和提交语义；
- 邮件、支付及后续 Provider 都使用共享字段组件、共享 definition 校验，并且只提交 `{ values }`；
- 不存在 `secretUpdates`、`keepExisting`、`masked` 等并行协议；
- D1 保存完整运行时配置，读取接口只返回普通值和 `configuredSecrets`；
- 未知字段、无效类型和缺少必填 Secret 的配置不能保存，也不能被运行时读取为有效配置；
- 配置损坏时页面明确显示，不能测试或启用，但允许停用；
- 第三方协议映射与签名、验签和业务状态校验保持清晰边界。
