import {
	Customer,
	EventBus,
	ExternalAuthenticationService,
	NativeAuthenticationMethod,
	TransactionalConnection
} from '@vendure/core';
import { EmailPlugin, EmailPluginOptions } from '@vendure/email-plugin';
import { EMAIL_PLUGIN_OPTIONS } from '@vendure/email-plugin/lib/src/constants';
import {
	createTestEnvironment,
	registerInitializer,
	SqljsInitializer,
	testConfig
} from '@vendure/testing';
import fs from 'fs';
import gql from 'graphql-tag';
import path from 'path';
import { Subscription } from 'rxjs';
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
	vitest
} from 'vitest';
import { oneTimeCodeRequestedEventHandler } from '../email-handler';
import { OneTimeCodeRequestedEvent } from '../events';
import { SimpleAuthPlugin } from '../simple-auth.module';
import { SimpleAuthService } from '../simple-auth.service';
import { initialData } from './fixtures/e2e-initial-data';

async function sleep(ms = 1000) {
	return await new Promise<void>((resolver) => {
		setTimeout(resolver, ms);
	});
}
const sqliteDataDir = path.join(__dirname, '__data__');

const REQUEST_ONE_TIME_CODE = gql(`
  query requestCode($email: String!){
    requestOneTimeCode(email: $email) {
      ...on OneTimeCode {
        value
      }
      ...on RequestOneTimeCodeError {
        message
        errorCode
      }
    }
  }
`);
const AUTHENTICATE = gql(`
  mutation authenticate($email: String!, $code: String!) {
    authenticate(input: { simple: { email: $email, code: $code } }) {
      ...on CurrentUser {
        identifier
      }

      ...on InvalidCredentialsError {
        errorCode
        message
        authenticationError
      }

    }
  }
`);

registerInitializer('sqljs', new SqljsInitializer(sqliteDataDir));
describe('SimpleAuthPlugin Testing', () => {
	const TEST_EMAIL = 'test@gmail.com';

	fs.mkdirSync(path.join(__dirname, '__data__/email/output'), {
		recursive: true
	});
	fs.mkdirSync(path.join(__dirname, '__data__/email/mailbox'), {
		recursive: true
	});
	fs.mkdirSync(path.join(__dirname, '__data__/email/templates/partials'), {
		recursive: true
	});

	const { server, shopClient, adminClient } = createTestEnvironment({
		...testConfig,
		plugins: [
			EmailPlugin.init({
				devMode: true,
				outputPath: path.join(__dirname, '__data__/email/output'),
				route: path.join(__dirname, '__data__/email/mailbox'),
				templatePath: path.join(__dirname, '__data__/email/templates'),
				handlers: []
			}),
			SimpleAuthPlugin.init({ ttl: 1, preventCrossStrategies: true })
		]
	});

	beforeAll(async () => {
		try {
			await server.init({
				productsCsvPath: path.join(__dirname, './fixtures/e2e-product-data-full.csv'),
				initialData: initialData
			});
		} catch (err) {
			console.log('Error happens during init server');
			console.log(err);
		}
	}, 60000);

	afterAll(async () => {
		try {
			await server.destroy();
		} catch (err) {
			console.log('Error during destroy server');
			console.log(err);
		}
	});

	let code = '';
	let email = '';
	let subscription: Subscription | null;
	let options: typeof SimpleAuthPlugin.options;

	beforeEach(async () => {
		await shopClient.asAnonymousUser();
		options = { ...SimpleAuthPlugin.options };

		const eventBus = await server.app.resolve(EventBus);
		subscription = eventBus.ofType(OneTimeCodeRequestedEvent).subscribe((event) => {
			code = event.code;
			email = event.email;
		});
	});
	afterEach(() => {
		Object.assign(SimpleAuthPlugin.options, options);

		subscription?.unsubscribe();
		code = '';
		email = '';
		subscription = null;
	});

	test('generate one time code and authenticate', async () => {
		const res = await shopClient.query(REQUEST_ONE_TIME_CODE, {
			email: TEST_EMAIL
		});
		expect(res).toMatchObject({
			requestOneTimeCode: { value: 'A code sent to your email' }
		});
		expect(email).toBe(TEST_EMAIL);

		const authRes = await shopClient.query(AUTHENTICATE, {
			code: code,
			email: email
		});
		expect(authRes).toMatchObject({
			authenticate: {
				identifier: TEST_EMAIL
			}
		});
	});

	test('code should renew after ttl reach', { timeout: 3000 }, async () => {
		const res = await shopClient.query(REQUEST_ONE_TIME_CODE, {
			email: TEST_EMAIL
		});
		expect(res).toMatchObject({
			requestOneTimeCode: { value: 'A code sent to your email' }
		});
		expect(email).toBe(TEST_EMAIL);

		const saveCode = code;

		await shopClient.query(REQUEST_ONE_TIME_CODE, { email: TEST_EMAIL });
		expect(code).toBe(saveCode);

		await sleep(1100);

		await shopClient.query(REQUEST_ONE_TIME_CODE, { email: TEST_EMAIL });
		expect(code).not.toBe(saveCode);
		expect(code.length).toBe(6);
	});

	test('code should invalidated after ttl reach', async () => {
		const res = await shopClient.query(REQUEST_ONE_TIME_CODE, {
			email: TEST_EMAIL
		});
		expect(res).toMatchObject({
			requestOneTimeCode: { value: 'A code sent to your email' }
		});
		expect(email).toBe(TEST_EMAIL);
		await sleep(1100);
		const authRes = await shopClient.query(AUTHENTICATE, {
			code: code,
			email: TEST_EMAIL
		});
		expect(authRes).toEqual({
			authenticate: expect.objectContaining({
				message: 'The provided credentials are invalid',
				errorCode: 'INVALID_CREDENTIALS_ERROR'
			})
		});
	}, 3000);

	test('should return error if input wrong code', async () => {
		SimpleAuthPlugin.options.preventCrossStrategies = false;

		const res = await shopClient.query(REQUEST_ONE_TIME_CODE, {
			email: TEST_EMAIL
		});
		expect(res).toMatchObject({
			requestOneTimeCode: { value: 'A code sent to your email' }
		});
		expect(email).toBe(TEST_EMAIL);

		const authRes = await shopClient.query(AUTHENTICATE, {
			code: code + 'X',
			email: TEST_EMAIL
		});
		expect(authRes).toEqual({
			authenticate: expect.objectContaining({
				message: 'The provided credentials are invalid',
				errorCode: 'INVALID_CREDENTIALS_ERROR'
			})
		});
	});

	test('should invalidate code after max failed attempts', async () => {
		SimpleAuthPlugin.options.preventCrossStrategies = false;
		SimpleAuthPlugin.options.attempts = 3;

		await shopClient.query(REQUEST_ONE_TIME_CODE, { email: TEST_EMAIL });
		expect(code).toBeTruthy();
		const correctCode = code;

		// Exhaust all attempts with wrong codes
		for (let i = 0; i < 3; i++) {
			const res = await shopClient.query(AUTHENTICATE, { email: TEST_EMAIL, code: 'WRONG!' });
			expect(res.authenticate.errorCode).toBe('INVALID_CREDENTIALS_ERROR');
		}

		// Correct code should now fail — code was invalidated
		const res = await shopClient.query(AUTHENTICATE, { email: TEST_EMAIL, code: correctCode });
		expect(res.authenticate.errorCode).toBe('INVALID_CREDENTIALS_ERROR');
	});

	test('should allow new code after previous was invalidated by attempts', async () => {
		SimpleAuthPlugin.options.preventCrossStrategies = false;
		SimpleAuthPlugin.options.attempts = 2;

		await shopClient.query(REQUEST_ONE_TIME_CODE, { email: TEST_EMAIL });

		// Exhaust attempts
		for (let i = 0; i < 2; i++) {
			await shopClient.query(AUTHENTICATE, { email: TEST_EMAIL, code: 'WRONG!' });
		}

		// Wait for TTL to expire so a fresh code can be generated
		await sleep(1100);

		// Request a new code — should work normally
		await shopClient.query(REQUEST_ONE_TIME_CODE, { email: TEST_EMAIL });
		const newCode = code;
		expect(newCode).toBeTruthy();

		const res = await shopClient.query(AUTHENTICATE, { email: TEST_EMAIL, code: newCode });
		expect(res.authenticate).toMatchObject({ identifier: TEST_EMAIL });
	}, 5000);

	test('should treat email as case-insensitive', async () => {
		await shopClient.query(REQUEST_ONE_TIME_CODE, {
			email: TEST_EMAIL.toUpperCase()
		});
		expect(email).toBe(TEST_EMAIL);

		const authRes = await shopClient.query(AUTHENTICATE, {
			code: code,
			email: TEST_EMAIL[0].toUpperCase() + TEST_EMAIL.substring(1)
		});
		expect(authRes).toMatchObject({
			authenticate: {
				identifier: TEST_EMAIL
			}
		});
	});

	test('input invalid email should be handled', async () => {
		try {
			await shopClient.query(REQUEST_ONE_TIME_CODE, {
				email: 'Thisnotanemail'
			});
		} catch (err) {
			const graphQLError = err as {
				response: { errors: { message: string }[] };
			};
			expect(err).toBeInstanceOf(Error);
			expect(graphQLError.response.errors.length).toBeGreaterThan(0);
			expect(graphQLError.response.errors[0]).toMatchObject({
				message: 'Thisnotanemail is not a valid email'
			});
		}
		const res = await shopClient.query(AUTHENTICATE, {
			email: 'Thisisnotanemail',
			code: 'XXX'
		});
		expect(res).toEqual({
			authenticate: expect.objectContaining({
				authenticationError: 'Email is invalid'
			})
		});
	});

	test('raise error when cross authentication detected', async () => {
		const externalAuthService = server.app.get(ExternalAuthenticationService);
		const spy = vi.spyOn(externalAuthService, 'findCustomerUser');

		spy.mockResolvedValue({
			id: 1,
			authenticationMethods: [],
			sessions: [],
			createdAt: new Date(),
			customFields: [],
			deletedAt: new Date(),
			identifier: TEST_EMAIL,
			verified: true,
			roles: [],
			getNativeAuthenticationMethod: (_strict?: boolean) => ({}) as NativeAuthenticationMethod,
			lastLogin: null,
			updatedAt: new Date()
		});

		const res = await shopClient.query(REQUEST_ONE_TIME_CODE, {
			email: TEST_EMAIL
		});
		expect(res.requestOneTimeCode).toMatchObject({
			errorCode: 'CROSS_EMAIL_AUTHENTICATION',
			message: 'Email already used with "native" authentication'
		});
		spy.mockClear();
		spy.mockRestore();
	});

	test('code should include alphabets', async () => {
		const simpleAuthService = server.app.get(SimpleAuthService);
		expect(simpleAuthService).toBeInstanceOf(SimpleAuthService);
		const tries = 10;
		SimpleAuthPlugin.options.includeAlphabet = true;
		const codes: string[] = [];

		for (let i = 0; i < tries; i++) {
			const code = await simpleAuthService.generateCode(`testing${i}@gmail.com`);
			codes.push(code);
		}
		expect(codes.some((code) => code.match(/[a-z]+/i))).toBeTruthy();
	});

	test('code should return along with requestOneTimeCode in dev mode', async () => {
		SimpleAuthPlugin.options.isDev = true;

		const res = await shopClient.query(REQUEST_ONE_TIME_CODE, {
			email: TEST_EMAIL
		});
		expect(res.requestOneTimeCode).toMatchObject({
			value: code
		});
	});

	describe('guest Customers', () => {
		const CREATE_CUSTOMER = gql(`
			mutation createCustomer($email: String!) {
				createCustomer(input: { emailAddress: $email, firstName: "Has", lastName: "Account" }, password: "secret123") {
					...on Customer { id }
					...on ErrorResult { errorCode message }
				}
			}
		`);

		/**
		 * What a guest checkout leaves behind: a Customer in the default Channel, without a User.
		 * Written directly, because the shop refuses a guest checkout for an email with an account.
		 */
		async function guestCheckout(guestEmail: string, firstName = 'Guest') {
			const connection = server.app.get(TransactionalConnection);
			const guest = await connection.rawConnection
				.getRepository(Customer)
				.save(new Customer({ emailAddress: guestEmail, firstName, lastName: 'Buyer' }));
			await connection.rawConnection
				.createQueryBuilder()
				.relation(Customer, 'channels')
				.of(guest.id)
				.add(1);
			return String(guest.id);
		}

		async function login(loginEmail: string) {
			await shopClient.asAnonymousUser();
			await shopClient.query(REQUEST_ONE_TIME_CODE, { email: loginEmail });
			return shopClient.query(AUTHENTICATE, { email: loginEmail, code });
		}

		async function customersOf(customerEmail: string) {
			const connection = server.app.get(TransactionalConnection);
			const rows = await connection.rawConnection
				.getRepository(Customer)
				.createQueryBuilder('customer')
				.leftJoinAndSelect('customer.user', 'user')
				.where('LOWER(customer.emailAddress) = :email', { email: customerEmail })
				.andWhere('customer.deletedAt IS NULL')
				.orderBy('customer.id', 'ASC')
				.getMany();
			return rows.map((c) => ({ id: String(c.id), firstName: c.firstName, user: c.user?.id }));
		}

		test('the first login gives the account to the guest Customer', async () => {
			const hook = vi.fn();
			SimpleAuthPlugin.options.onGuestCustomerLinked = hook;
			const guestId = await guestCheckout('guest-one@gmail.com');

			const res = await login('guest-one@gmail.com');
			expect(res.authenticate).toMatchObject({ identifier: 'guest-one@gmail.com' });

			const customers = await customersOf('guest-one@gmail.com');
			expect(customers).toHaveLength(1);
			expect(customers[0]).toMatchObject({ id: guestId, firstName: 'Guest' });
			expect(customers[0].user).toBeTruthy();
			expect(hook).toHaveBeenCalledTimes(1);
			expect(String(hook.mock.calls[0][1].id)).toBe(guestId);

			// The next login finds the same account, and does not link again.
			await login('guest-one@gmail.com');
			expect(await customersOf('guest-one@gmail.com')).toHaveLength(1);
			expect(hook).toHaveBeenCalledTimes(1);
			SimpleAuthPlugin.options.onGuestCustomerLinked = undefined;
		});

		test('the guest is found whatever the case of the email', async () => {
			const guestId = await guestCheckout('Guest.Two@Gmail.com');

			await login('guest.two@gmail.com');

			const customers = await customersOf('guest.two@gmail.com');
			expect(customers).toHaveLength(1);
			expect(customers[0].id).toBe(guestId);
			expect(customers[0].user).toBeTruthy();
		});

		test('with linkGuestCustomers off, the login creates a second Customer', async () => {
			SimpleAuthPlugin.options.linkGuestCustomers = false;
			const guestId = await guestCheckout('guest-three@gmail.com');

			await login('guest-three@gmail.com');

			const customers = await customersOf('guest-three@gmail.com');
			expect(customers).toHaveLength(2);
			expect(customers[0]).toMatchObject({ id: guestId, user: undefined });
			expect(customers[1].user).toBeTruthy();
		});

		test('a deleted guest is left alone', async () => {
			const guestId = await guestCheckout('guest-four@gmail.com');
			const connection = server.app.get(TransactionalConnection);
			await connection.rawConnection
				.getRepository(Customer)
				.update({ id: guestId }, { deletedAt: new Date() });

			await login('guest-four@gmail.com');

			const customers = await customersOf('guest-four@gmail.com');
			expect(customers).toHaveLength(1);
			expect(customers[0].id).not.toBe(guestId);
		});

		test('a Customer with an account wins over a guest with the same email', async () => {
			// The account is a native one, which the cross-strategy check would refuse.
			SimpleAuthPlugin.options.preventCrossStrategies = false;
			await adminClient.asSuperAdmin();
			const created = await adminClient.query(CREATE_CUSTOMER, { email: 'guest-five@gmail.com' });
			expect(created.createCustomer.id).toBeTruthy();
			const guestId = await guestCheckout('guest-five@gmail.com', 'Old');

			const res = await login('guest-five@gmail.com');
			expect(res.authenticate).toMatchObject({ identifier: 'guest-five@gmail.com' });

			const customers = await customersOf('guest-five@gmail.com');
			expect(customers).toHaveLength(2);
			// The Admin API ids carry the test prefix, so the account is found by its name.
			expect(customers.find((c) => c.firstName === 'Has')?.user).toBeTruthy();
			expect(customers.find((c) => c.id === guestId)?.user).toBeUndefined();
		});
	});

	test('email handler should trigger', async () => {
		const emailOptions = server.app.get<EmailPluginOptions>(EMAIL_PLUGIN_OPTIONS);
		expect(emailOptions.handlers).contain(oneTimeCodeRequestedEventHandler);
		const spy = vitest.spyOn(oneTimeCodeRequestedEventHandler, 'handle');

		await shopClient.query(REQUEST_ONE_TIME_CODE, { email: TEST_EMAIL });
		await sleep(100);
		expect(spy).toBeCalledTimes(1);

		expect(spy.mock.lastCall?.[0].code).toBe(code);
		expect(spy.mock.lastCall?.[0].email).toBe(TEST_EMAIL);

		spy.mockClear();
	});
});

describe('SimpleAuthPlugin load without EmailPlugin', () => {
	/**
	 * Without saveOptions, this suite test will affect other suites
	 * because SimpleAuthPlugin.options is static
	 *
	 * In real application, this is not the case because SimpleAuthPlugin
	 * should only init once
	 */
	const saveOptions = SimpleAuthPlugin.options;

	const { server } = createTestEnvironment({
		...testConfig,
		plugins: [SimpleAuthPlugin.init(saveOptions)]
	});
	beforeAll(async () => {
		await server.init({
			productsCsvPath: path.join(__dirname, 'fixtures/e2e-product-data-full.csv'),
			initialData: initialData
		});
	});

	afterAll(async () => {
		await server.destroy();
	});

	test('server runs', () => {
		const plugin = server.app.get(SimpleAuthPlugin);
		expect(plugin).toBeInstanceOf(SimpleAuthPlugin);
	});
});
