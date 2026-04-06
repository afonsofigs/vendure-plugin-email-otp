/*
https://docs.nestjs.com/modules
*/

import { CacheModule } from '@nestjs/cache-manager';
import { Inject, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { ConfigService, Logger, PluginCommonModule, Type, VendurePlugin } from '@vendure/core';
import { EmailPlugin, EmailPluginOptions } from '@vendure/email-plugin';
import { EMAIL_PLUGIN_OPTIONS } from '@vendure/email-plugin/lib/src/constants';
import fs from 'fs';
import path from 'path';
import {
	DEFAULT_OPTIONS,
	EMAIL_EVENT_NAME,
	SIMPLE_AUTH_PLUGIN_LOG_CONTEXT,
	SIMPLE_AUTH_PLUGIN_OPTIONS
} from './constants';
import { copyDir } from './copy-dir';
import { oneTimeCodeRequestedEventHandler } from './email-handler';
import { ISimpleAuthPluginOptions } from './interfaces';
import { queryExtension } from './schema';
import { SimpleAuthStrategy } from './simple-auth-strategy';
import { SimpleAuthResolver } from './simple-auth.resolver';
import { SimpleAuthService } from './simple-auth.service';

@VendurePlugin({
	imports: [
		PluginCommonModule,
		CacheModule.registerAsync({
			useFactory: () => {
				return SimpleAuthPlugin.options.cacheModuleOption;
			}
		}),
		EmailPlugin
	],
	providers: [
		SimpleAuthService,
		{
			provide: SIMPLE_AUTH_PLUGIN_OPTIONS,
			useFactory: () => SimpleAuthPlugin.options
		}
	],
	shopApiExtensions: {
		schema: queryExtension,
		resolvers: [SimpleAuthResolver]
	},
	configuration: (conf) => {
		const simpleAuthStrategy = new SimpleAuthStrategy();
		conf.authOptions.shopAuthenticationStrategy.push(simpleAuthStrategy);

		return conf;
	}
})
export class SimpleAuthPlugin implements OnApplicationBootstrap, OnModuleInit {
	constructor(
		@Inject(ConfigService) private conf: ConfigService,
		@Inject(EMAIL_PLUGIN_OPTIONS) private emailConf: EmailPluginOptions
	) {}
	onModuleInit() {
		this.registerEventHandler();
	}
	onApplicationBootstrap() {
		this.cloneEmailTemplate();
	}

	registerEventHandler() {
		const handlerExisted = this.emailConf.handlers.some(
			(handler) => handler.listener.type === EMAIL_EVENT_NAME
		);
		if (handlerExisted) {
			return;
		}

		this.emailConf.handlers.push(oneTimeCodeRequestedEventHandler);
	}

	cloneEmailTemplate() {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		const plugins = this.conf.plugins as Type<any>[];
		const emailPlugin = plugins.find((plg) => plg == EmailPlugin);
		if (!emailPlugin) {
			Logger.warn(
				'Cannot find EmailPlugin in Vendure Config. This plugin might not work correctly.',
				SIMPLE_AUTH_PLUGIN_LOG_CONTEXT
			);
			return;
		}

		const options = (emailPlugin as any)['options'] as EmailPluginOptions;

		// Support both legacy templatePath and modern templateLoader
		let templatePath = options.templatePath;
		if (!templatePath && options.templateLoader && 'templatePath' in options.templateLoader) {
			templatePath = (options.templateLoader as any).templatePath;
		}

		if (!templatePath) {
			Logger.warn(
				'Cannot determine email template path from EmailPlugin. ' +
					'The default OTP email template will not be available. ' +
					'Ensure your EmailPlugin uses FileBasedTemplateLoader or templatePath.',
				SIMPLE_AUTH_PLUGIN_LOG_CONTEXT
			);
			return;
		}

		// Create the target directory if it doesn't exist
		const targetDir = path.join(templatePath, 'onetimecode-requested');
		if (!fs.existsSync(targetDir)) {
			fs.mkdirSync(targetDir, { recursive: true });
		}

		copyDir(path.join(__dirname, './template/onetimecode-requested'), templatePath);
		Logger.info(
			`Template for onetimecode-requested available at ${templatePath}`,
			SIMPLE_AUTH_PLUGIN_LOG_CONTEXT
		);
	}

	static options: NonNullable<ISimpleAuthPluginOptions> = DEFAULT_OPTIONS;
	static init(options: Partial<ISimpleAuthPluginOptions>) {
		SimpleAuthPlugin.options = {
			...DEFAULT_OPTIONS,
			...options
		};

		return SimpleAuthPlugin;
	}
}
