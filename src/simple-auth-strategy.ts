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
import { STRATEGY_NAME } from './constants';
import { SimpleAuthService } from './simple-auth.service';

export type SimpleAuthData = {
	email: string;
	code: string;
};

export class SimpleAuthStrategy implements AuthenticationStrategy<SimpleAuthData> {
	name = STRATEGY_NAME;
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
		const email = data.email.toLowerCase();
		const isValidCode = await this.simpleAuthService.verifyCode(email, data.code);

		if (!isValidCode) return 'Invalid verification code';

		let user = await this.externalAuthenticationService.findCustomerUser(ctx, this.name, email);

		if (user) return user;

		user = await this.externalAuthenticationService.createCustomerAndUser(ctx, {
			emailAddress: data.email,
			externalIdentifier: data.email,
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
		this.externalAuthenticationService = injector.get(ExternalAuthenticationService);
		this.simpleAuthService = injector.get(SimpleAuthService);
		this.eventBus = injector.get(EventBus);
		this.customerService = injector.get(CustomerService);
	}
}
