import { command } from 'cleye';
import { spinner, intro, outro, text, isCancel } from '@clack/prompts';
import { cyan, green } from 'kolorist';
import { generateGroqCompletion, readData } from '../helpers/completion';
import { getConfig } from '../helpers/config';
import { streamToIterable } from '../helpers/stream-to-iterable';
import i18n from '../helpers/i18n';

interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
}

interface GetResponseParams {
  prompt: string;
  key: string;
  model?: string;
  apiEndpoint: string;
}

async function getResponse(params: GetResponseParams): Promise<{ readResponse: (writer: (data: string) => void) => Promise<string> }> {
  const { prompt, key, model, apiEndpoint } = params;
  const stream = await generateGroqCompletion({
    prompt,
    key,
    model,
    apiEndpoint,
  });
  const iterableStream = streamToIterable(stream);
  return { readResponse: readData(iterableStream) };
}

export default command(
  {
    name: 'chat',
    help: {
      description:
        'Start a new chat session to send and receive messages, continue replying until the user chooses to exit.',
    },
  },
  async () => {
    const {
      GROQ_API_KEY: key,
      GROQ_API_ENDPOINT: apiEndpoint,
      MODEL: model,
    } = await getConfig();
    const chatHistory: ChatEntry[] = [];

    console.log('');
    intro(i18n.t('Starting new conversation'));
    const prompt = async () => {
      const msgYou = `${i18n.t('You')}:`;
      const userPrompt = (await text({
        message: `${cyan(msgYou)}`,
        placeholder: i18n.t(`send a message ('exit' to quit)`),
        validate: (value) => {
          if (!value) return i18n.t('Please enter a prompt.');
        },
      })) as string;

      if (isCancel(userPrompt) || userPrompt === 'exit') {
        outro(i18n.t('Goodbye!'));
        process.exit(0);
      }

      const infoSpin = spinner();
      infoSpin.start(i18n.t(`THINKING...`));
      chatHistory.push({
        role: 'user',
        content: userPrompt,
      });
      // Join the chat history into a single string for the prompt
      const promptString = chatHistory.map(entry => `${entry.role}: ${entry.content}`).join('\n');

      const { readResponse } = await getResponse({
        prompt: promptString,
        key,
        model,
        apiEndpoint,
      });

      infoSpin.stop(`${green('AI Shell:')}`);
      console.log('');
      const fullResponse = await readResponse(
        process.stdout.write.bind(process.stdout)
      );
      chatHistory.push({
        role: 'assistant',
        content: fullResponse,
      });
      console.log('');
      console.log('');
      prompt();
    };

    prompt();
  }
);