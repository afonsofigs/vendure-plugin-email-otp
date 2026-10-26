import { CacheManagerOptions, CacheModuleOptions } from '@nestjs/cache-manager';
import { Customer, Injector, RequestContext } from '@vendure/core';

export interface ISimpleAuthPluginOptions {
	/**
	 * @description
	 * How many times to allow User attempt the verification code.
	 * After attempts reached, the code will be invalidated
	 * @default
	 * 5
	 */
	attempts: number;

	/**
	 * @description
	 * Time to live in seconds once a code created.
	 * If the code not being verified by users during the ttl window, it will be discarded
	 *
	 * @default
	 * 600 - 10 minutes
	 */
	ttl: number;

	/**
	 * @description
	 * How many digits/letters the code should be
	 *
	 * @example
	 * 6 digits code: 340082
	 *
	 * @default
	 * 6
	 */
	length: number;

	/**
	 * @description
	 * Allow alphabets in code
	 *
	 * @default
	 * false - Only digits allow
	 */
	includeAlphabet: boolean;

	/**
	 * @description
	 * Developer mode
	 * If enabled, the code will return along with the response "requestOneTimeCode"
	 *
	 * @default
	 * false
	 */
	isDev: boolean;

	/**
	 * @description
	 * By default, the plugin use 'memory' for caching using NestJs CacheModule
	 * To change cache store to Redis, MongoDB, etc, please see NestJs CacheModule docs
	 * @see https://docs.nestjs.com/techniques/caching#different-stores
	 * You also want to @see https://github.com/node-cache-manager/node-cache-manager/tree/4.1.0
	 *
	 */
	cacheModuleOption: Omit<CacheManagerOptions | CacheModuleOptions, 'ttl'>;

	/**
	 * @description
	 * Strictly enforce unique email among all strategies
	 *
	 * For example:
	 *  - One day, user "John" sign in using Google authentication with "john@gmail.com"
	 *  - Another day, user "John" sign in using One-time passcode authenication (this plugin) with the same email
	 *  - This plugin will throw an error if the flag is enabled
	 *
	 * @default
	 * false
	 *
	 * @note
	 * This only works if Google authentication plugin using email as an identifier
	 */
	preventCrossStrategies: boolean;

	/**
	 * @description
	 * Custom subject line for the one-time code email
	 *
	 * @default
	 * 'One Time Code for website'
	 */
	emailSubject: string;

	/**
	 * @description
	 * Give the account to a guest Customer with the same email on the first login.
	 *
	 * A guest checkout creates a Customer without a User. Vendure does not link an external
	 * login to it, so without this option the first login creates a second Customer beside the
	 * guest, and the guest's orders stay with a Customer nobody can log in as.
	 *
	 * With this option, when the email has no Customer with an account yet, the oldest guest
	 * Customer with that email (case-insensitive, current Channel) gets the new User. The
	 * one-time code proves that the person owns the email, which is the same condition Vendure
	 * requires to link an account. A Customer that already has an account always wins, and is
	 * left to Vendure as before.
	 *
	 * @default
	 * true
	 */
	linkGuestCustomers: boolean;

	/**
	 * @description
	 * Called when a guest Customer has just been given an account (see `linkGuestCustomers`),
	 * inside the login request and its transaction, before `authenticate` returns. Use it for
	 * what your storefront needs before the first page after login, for example to send the
	 * person through the same onboarding as a new Customer.
	 *
	 * An error thrown here fails the login, and the transaction is rolled back.
	 */
	onGuestCustomerLinked?: (
		ctx: RequestContext,
		customer: Customer,
		injector: Injector
	) => Promise<void> | void;
}
