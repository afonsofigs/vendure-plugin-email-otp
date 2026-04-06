# vendure-plugin-email-otp

Vendure plugin for passwordless authentication via email OTP (one-time passcode).

> Fork of [@denz93/vendure-plugin-simple-auth](https://github.com/denz93/vendure-plugin-simple-auth), updated and maintained for Vendure 3.x.

## How it works

1. Customer submits their email address
2. The plugin generates a one-time code, stores it in cache (memory or Redis), and fires a `OneTimeCodeRequestedEvent`
3. Vendure's `EmailPlugin` picks up the event and sends the code via email
4. Customer submits the code — if valid, they are authenticated (and auto-registered if new)

No passwords, no signup forms.

## Installation

```bash
pnpm add vendure-plugin-email-otp
```

## Setup

### 1. Add the plugin to your Vendure config

```typescript
import { SimpleAuthPlugin } from 'vendure-plugin-email-otp';
import { EmailPlugin, FileBasedTemplateLoader, defaultEmailHandlers } from '@vendure/email-plugin';
import KeyvRedis from '@keyv/redis';

const keyvRedis = new KeyvRedis('redis://localhost:6379');

export const config: VendureConfig = {
  plugins: [
    EmailPlugin.init({
      handlers: defaultEmailHandlers,
      transport: { /* your SMTP config */ },
      templateLoader: new FileBasedTemplateLoader(
        path.join(__dirname, '../static/email/templates')
      ),
      globalTemplateVars: {
        fromAddress: '"My Store" <noreply@mystore.com>',
      },
    }),

    SimpleAuthPlugin.init({
      ttl: 900, // code valid for 15 minutes
      cacheModuleOption: {
        stores: [keyvRedis],
      },
      emailSubject: 'Your access code — My Store',
    }),
  ],
};
```

> The plugin automatically registers its email handler with `EmailPlugin` — no need to add it to the `handlers` array.

### 2. Create the email template

The plugin ships a minimal default template, but you should provide your own. Create the file:

```
static/email/templates/onetimecode-requested/body.hbs
```

The template receives a single variable: **`{{code}}`** — the one-time code.

Example using MJML (with optional header/footer partials):

```handlebars
{{> header title="Access Code" }}

<mj-section padding="40px 0">
  <mj-column>
    <mj-text align="center" font-size="14px">
      Use the code below to sign in to your account.
    </mj-text>
  </mj-column>
</mj-section>

<mj-section background-color="#EBEBEB" padding="28px 0">
  <mj-column>
    <mj-text font-size="42px" font-weight="bold" align="center"
             font-family="'Courier New', monospace" letter-spacing="12px">
      {{code}}
    </mj-text>
  </mj-column>
</mj-section>

<mj-section padding="20px 0">
  <mj-column>
    <mj-text font-size="12px" align="center" color="#999">
      Valid for 15 minutes. If you didn't request this code, ignore this email.
    </mj-text>
  </mj-column>
</mj-section>

{{> footer }}
```

### 3. GraphQL usage

**Step 1 — Request a code:**

```graphql
query {
  requestOneTimeCode(email: "customer@example.com") {
    ... on OneTimeCode {
      value   # "A code sent to your email" (or the actual code if isDev: true)
    }
    ... on RequestOneTimeCodeError {
      errorCode
      message
    }
  }
}
```

**Step 2 — Authenticate with the code:**

```graphql
mutation {
  authenticate(input: {
    simple: {
      email: "customer@example.com"
      code: "384721"
    }
  }) {
    ... on CurrentUser {
      id
      identifier
    }
    ... on ErrorResult {
      errorCode
      message
    }
  }
}
```

If the email doesn't match any existing customer, a new customer account is created automatically.

## Options

All options are optional — defaults are shown below.

| Option                   | Type                | Default                        | Description                                                                                     |
| ------------------------ | ------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `ttl`                    | `number`            | `600`                          | Code validity in seconds                                                                        |
| `length`                 | `number`            | `6`                            | Number of digits/characters in the code                                                         |
| `attempts`               | `number`            | `5`                            | Max verification attempts before the code is invalidated                                        |
| `includeAlphabet`        | `boolean`           | `false`                        | Include letters in the code (digits only by default)                                            |
| `isDev`                  | `boolean`           | `false`                        | Return the actual code in the `requestOneTimeCode` response (for development/testing)           |
| `emailSubject`           | `string`            | `'One Time Code for website'`  | Subject line of the OTP email                                                                   |
| `cacheModuleOption`      | `CacheModuleOption` | `{}`                           | Cache store config — memory by default, pass a Redis/Keyv store for production                  |
| `preventCrossStrategies` | `boolean`           | `false`                        | Reject login if the email is already registered with a different auth strategy (e.g. Google)    |

## Requirements

- Vendure 3.x
- `@vendure/email-plugin` configured with a `templateLoader` pointing to your templates directory

## License

MIT
