import { BadRequestException, Inject, PipeTransform } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { Ctx, EventBus, Logger, RequestContext } from '@vendure/core';
import { validate as isEmail } from 'isemail';
import { SIMPLE_AUTH_PLUGIN_LOG_CONTEXT, SIMPLE_AUTH_PLUGIN_OPTIONS } from './constants';
import { OneTimeCodeRequestedEvent } from './events';
import { ISimpleAuthPluginOptions } from './interfaces';
import { SimpleAuthService } from './simple-auth.service';

class EmailValidation implements PipeTransform<string, string> {
	transform(value: string): string {
		if (isEmail(value)) {
			return value.toLowerCase();
		}
		throw new BadRequestException(`${value} is not a valid email`);
	}
}

export class RequestOneTimeCodeError {
	readonly __typename = 'RequestOneTimeCodeError';

	constructor(
		public message: string,
		public errorCode: string
	) {}
}

@Resolver()
export class SimpleAuthResolver {
	constructor(
		@Inject(SimpleAuthService) private service: SimpleAuthService,
		@Inject(EventBus) private eventBus: EventBus,
		@Inject(SIMPLE_AUTH_PLUGIN_OPTIONS) private pluginOptions: ISimpleAuthPluginOptions
	) {}

	@Query()
	async requestOneTimeCode(
		@Ctx() ctx: RequestContext,
		@Args('email', EmailValidation) email: string
	) {
		try {
			if (this.pluginOptions.preventCrossStrategies) {
				const foundStrategy = await this.service.checkCrossStrategies(ctx, email);
				if (foundStrategy)
					return new RequestOneTimeCodeError(
						`Email already used with "${foundStrategy}" authentication`,
						'CROSS_EMAIL_AUTHENTICATION'
					);
			}
			const value = await this.service.generateCode(email);
			const filteredValue = this.pluginOptions.isDev ? value : 'A code sent to your email';
			this.eventBus.publish(new OneTimeCodeRequestedEvent(value, email, ctx));

			return { __typename: 'OneTimeCode', value: filteredValue };
		} catch (error) {
			Logger.error(
				`Failed to generate OTP for ${email}: ${error instanceof Error ? error.message : String(error)}`,
				SIMPLE_AUTH_PLUGIN_LOG_CONTEXT,
				error instanceof Error ? error.stack : undefined
			);
			return new RequestOneTimeCodeError(
				'Failed to generate code. Please try again later.',
				'OTP_GENERATION_ERROR'
			);
		}
	}
}
