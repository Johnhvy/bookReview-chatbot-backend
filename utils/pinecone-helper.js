import path from 'path';
import dotenv from 'dotenv';
// import { pinecone } from '@pinecone-database/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
// import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
// import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { loadQAChain } from 'langchain/chains';
import { OpenAIChat } from 'langchain/llms/openai';
import { CallbackManager } from 'langchain/callbacks';
import { PromptTemplate } from 'langchain/prompts';
import { z } from 'zod';
import { StructuredOutputParser, OutputFixingParser } from 'langchain/output_parsers';

import { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE } from '../config/pinecone';
import { encode } from 'gpt-tokenizer';
import { getTextFromExcel } from './getText';

dotenv.config({ path: path.join(__dirname, '../.env') });

if (!process.env.PINECONE_ENVIRONMENT || !process.env.PINECONE_API_KEY) {
  throw new Error('Pinecone environment or api key vars missing');
}

export const initPinecone = async () => {
  try {
    const pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
      environment: process.env.PINECONE_ENVIRONMENT
      // projectId:process.env.PINECONE_PROJECT_ID
    });
    console.log('log index-0==', pc.index);

    const indexName = process.env.PINECONE_INDEX_NAME;
    const index = pc.Index(indexName);

    // Verify connection by fetching index stats
    const stats = await index.describeIndexStats();
    console.log('Pinecone connection verified:', {
      indexName,
      vectorCount: stats.totalVectorCount,
      dimension: stats.dimension
    });

    return { client: pc, index };
  } catch (error) {
    console.error('Pinecone initialization error:', {
      message: error.message,
      stack: error.stack,
      config: {
        environment: process.env.PINECONE_ENVIRONMENT,
        indexName: process.env.PINECONE_INDEX_NAME
      }
    });
    throw error;
  }
};

export const embeddingPinecone = async (filePath) => {
  console.log('init file', filePath);
  console.log("OpenAI API Key:", process.env.OPENAI_API_KEY);
  try {
    const { index } = await initPinecone();

    const contentsArray = await getTextFromExcel(filePath);
    // console.log('contents=>>>>>>>>>>>>', contents);
    const contents = contentsArray.map(row => Object.values(row).join(' ')).join('\n')
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 3000,
      chunkOverlap: 500,
    });

    const docs = await textSplitter.splitText(contents);

    let token_count = 0;
    docs.map((doc, idx) => {
      token_count += encode(doc).length;
    });

    const metadatas = docs.map(() => {
      return path.basename(filePath, path.extname(filePath));
    });
    console.log('creating vector store...');
    /*create and store the embeddings in the vectorStore*/
    const embeddings = new OpenAIEmbeddings();

    // const index = pinecone.Index(process.env.PINECONE_INDEX_NAME)
    console.log('pineconeIndex', index);

    //embed the PDF documents
    const result = await PineconeStore.fromTexts(docs, metadatas, embeddings, {
      pineconeIndex: index,
      namespace: PINECONE_NAME_SPACE || 'default',
      textKey: 'text',
      batchSize: 100
    });
    console.log('Ingest completed --------');
    return result;
  } catch (error) {
    return error.message
    // console.log(error);
    // console.error('Document embedding error:', {
    //   message: error.message,
    //   stack: error.stack,
    // });
    // throw error;
    // throw new Error('Failed to ingest your data', error.message);
  }
}

/**
 * @function_name removePineconeData
 * @flag 1: del by all , id: del by id
 * @return none
 * @description delete pinecone database
 */

export const removePineconeData = async (del_flag) => {
  try {
    // const pinecone = await initPinecone();
    const index = pinecone.Index(PINECONE_INDEX_NAME); //change to your own index name
    await index.delete1({
      deleteAll: true,
      namespace: PINECONE_NAME_SPACE,
    });
    console.log('Pinecone data deleted --------');
  } catch (error) {
    console.log('error', error);
    throw new Error('Failed to delete pinecone data');
  }
};

export const getRecommendBook = async ({ question }) => {
  // OpenAI recommends replacing newlines with spaces for best results
  const sanitizedQuestion = question.trim().replaceAll('\n', ' ');

  try {
    const pinecone = await initPinecone();
    // const index = pinecone.Index(PINECONE_INDEX_NAME);

    /* Create vectorstore*/
    const vectorStore = await PineconeStore.fromExistingIndex(new OpenAIEmbeddings({}), {
      pineconeIndex: process.env.PINECONE_INDEX_NAME,
      textKey: 'text',
      namespace: PINECONE_NAME_SPACE, //namespace comes from your config folder
    });

    // Get suitable docs
    let suitableDocs = await vectorStore.similaritySearch(sanitizedQuestion);
    console.log('suitableDocs is : ', suitableDocs);

    const chat_model = new OpenAIChat({
      openAIApiKey: process.env.OPENAI_API_KEY,
      temperature: 0,
      modelName: 'gpt-4-1106-preview',
      verbose: true,
      streaming: true,
      callbackManager: CallbackManager.fromHandlers({
        async handleLLMNewToken(token) {
          console.log(token);
        },
      }),
    });

    const outputParser = StructuredOutputParser.fromZodSchema(
      z
        .array(
          z.object({
            title: z.string().describe('The title of study course'),
            description: z.string().describe('The description of study course'),
          })
        )
        .length(5)
    );
    const outputFixingParser = OutputFixingParser.fromLLM(chat_model, outputParser);

    const prompt = new PromptTemplate({
      template: `
      Your name is "Book Review AI Chatbot".
      You are an expert in recommending philosophical books. 
      Given a keyword, proposition, or both, suggest the top 1-3 books that will help deepen philosophical awareness and consideration. 
      Some data that you can reference will be provided for this. \n Data:{context}\n
      User ask to you random questions. and you have to analysis this and make study course of five each type with data provided. \n Question: {question}\n
      List five study courses.     
      Output schema like this \n{
      Title:
      Author Name:
      Reason for Recommendation: Explain how this book relates to the input and its value in enhancing philosophical understanding.
      }\n `,
      inputVariables: ['keyword', 'proposition', 'keyword, proposition'],
      partialVariables: {
        format_instructions: outputFixingParser.getFormatInstructions(),
      },
    });

    // Create QA Chain
    const chain = loadQAChain(chat_model, {
      type: 'stuff',
      prompt,
      outputParser: outputFixingParser,
    });

    const res = await chain.call({
      input_documents: suitableDocs,
      question: sanitizedQuestion,
    });

    let result;
    if (isJSON(res.text)) {
      result = JSON.stringify(JSON.parse(res.text).items);
      console.log('JSON------------');
    } else {
      result = res.text;
      console.log('not JSON------------');
    }

    const parsed_data = await outputFixingParser.parse(result);
    console.log('parsed_text---------------------', parsed_data);
    const response = {
      text: parsed_data,
      sourceDocuments: suitableDocs,
    };

    return response;
  } catch (error) {
    console.log('error', error);
    return error;
  }
}