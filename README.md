# vendure-plugin-email-otp

Vendure plugin for passwordless authentication via email OTP (one-time passcode).

> Fork of [@denz93/vendure-plugin-simple-auth](https://github.com/denz93/vendure-plugin-simple-auth), updated and maintained for Vendure 3.x.

## Use Case

Customers often hesitate to create credentials at checkout. This plugin lets them authenticate quickly using just their email and a one-time verification code.

## What it does

1. Exposes a GraphQL Query `requestOneTimeCode`
2. Adds an authentication strategy to the GraphQL mutation `authenticate`

## Installation

```bash
npm install vendure-plugin-email-otp
```

or

```bash
pnpm add vendure-plugin-email-otp
```

## Setup

### 1. Add the plugin to your Vendure config

```typescript
import { SimpleAuthPlugin } from 'vendure-plugin-email-otp';

export const config: VendureConfig = {
	// ...
	plugins: [
		// ...
		SimpleAuthPlugin.init(options) // see Options below
	]
};
```

### 2. Options for `SimpleAuthPlugin.init`

| Option                   | Type                | Default         | Description                                                                                                                        |
| ------------------------ | ------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `attempts`               | `number`            | `5`             | Max verification attempts before code is invalidated                                                                               |
| `ttl`                    | `number`            | `600` (seconds) | How long the verification code is valid                                                                                            |
| `length`                 | `number`            | `6`             | Number of digits/characters in the code                                                                                            |
| `includeAlphabet`        | `boolean`           | `false`         | Allow alphabet characters (digits only by default)                                                                                 |
| `isDev`                  | `boolean`           | `false`         | If true, returns the code in the `requestOneTimeCode` response (for testing)                                                       |
| `cacheModuleOption`      | `CacheModuleOption` | `{}`            | Cache store config (memory by default). See [NestJS CacheModule docs](https://docs.nestjs.com/techniques/caching#different-stores) |
| `preventCrossStrategies` | `boolean`           | `false`         | Enforce unique email across all auth strategies                                                                                    |

### 3. Email Handler

Since v1.3.0, the plugin automatically registers the email handler with the EmailPlugin. No manual configuration needed.

If you prefer to register it manually:

```typescript
import { oneTimeCodeRequestedEventHandler } from 'vendure-plugin-email-otp';

EmailPlugin.init({
	// ...
	handlers: [...defaultEmailHandler, oneTimeCodeRequestedEventHandler]
});
```

## License

MIT - See [LICENSE](LICENSE) for details.
