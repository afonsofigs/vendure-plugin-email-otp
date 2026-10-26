import {
	AuthenticationStrategy,
	CustomerEvent,
	CustomerService,
	EventBus,
	ExternalAuthenticationService,
	Injector,
	RequestContext,
	User
} from '@vendure/core';
import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';
import { validate as isEmail } from 'isemail';
import { SIMPLE_AUTH_PLUGIN_OPTIONS, STRATEGY_NAME } from './constants';
import { ISimpleAuthPluginOptions } from './interfaces';
import { SimpleAuthService } from './simple-auth.service';

export type SimpleAuthData = {
	email: string;
	code: string;
};

export class SimpleAuthStrategy implements AuthenticationStrategy<SimpleAuthData> {
	name = STRATEGY_NAME;
	private injector: Injector;
	private options: ISimpleAuthPluginOptions;
	private simpleAuthService: SimpleAuthService;
	private externalAuthenticationService: ExternalAuthenticationService;
	private eventBus: EventBus;
	private customerService: CustomerService;

	defineInputType(): DocumentNode {
		return gql`
			input SimpleAuthInput {
				email: String!
				code: String!
			}
		`;
	}

	async authenticate(ctx: RequestContext, data: SimpleAuthData): Promise<string | false | User> {
		if (!isEmail(data.email)) {
			return 'Email is invalid';
		}
		// The same form everywhere: the code, the external identifier and the Customer.
		const email = data.email.trim().toLowerCase();
		const isValidCode = await this.simpleAuthService.verifyCode(email, data.code);

		if (!isValidCode) return 'Invalid verification code';

		let user = await this.externalAuthenticationService.findCustomerUser(ctx, this.name, email);

		if (user) return user;

		if (this.options.linkGuestCustomers) {
			const linked = await this.simpleAuthService.linkGuestCustomer(ctx, email);
			if (linked) {
				await this.options.onGuestCustomerLinked?.(ctx, linked.customer, this.injector);
				return linked.user;
			}
		}

		user = await this.externalAuthenticationService.createCustomerAndUser(ctx, {
			emailAddress: email,
			externalIdentifier: email,
			strategy: this.name,
			verified: true,
			firstName: '',
			lastName: ''
		});

		const customer = await this.customerService.findOneByUserId(ctx, user.id);
		if (customer) {
			this.eventBus.publish(new CustomerEvent(ctx, customer, 'created'));
		}

		return user;
	}

	init(injector: Injector) {
		this.injector = injector;
		this.options = injector.get<ISimpleAuthPluginOptions>(SIMPLE_AUTH_PLUGIN_OPTIONS);
		this.externalAuthenticationService = injector.get(ExternalAuthenticationService);
		this.simpleAuthService = injector.get(SimpleAuthService);
		this.eventBus = injector.get(EventBus);
		this.customerService = injector.get(CustomerService);
	}
}
