import { EmailEventListener } from '@vendure/email-plugin';
import { EMAIL_EVENT_NAME } from './constants';
import { OneTimeCodeRequestedEvent } from './events';
import { SimpleAuthPlugin } from './simple-auth.module';

export const oneTimeCodeRequestedEventHandler = new EmailEventListener(EMAIL_EVENT_NAME)
	.on(OneTimeCodeRequestedEvent)
	.setRecipient((event) => event.email)
	.setSubject(() => SimpleAuthPlugin.options.emailSubject)
	.setFrom('{{ fromAddress }}')
	.setTemplateVars((event) => ({ code: event.code }));
