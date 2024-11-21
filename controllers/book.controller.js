import path from 'path';
import fs from 'fs';
import { getRecommendBook, embeddingPinecone } from "../utils/pinecone-helper";

export const recommendBook = async (req) => {
  console.log('getMainCourse called : ', req.body);
  return getRecommendBook(req.body);
};

export const uploadFile = async (file) => {
  const uploadPath = 'uploads'
  fs.mkdirSync(uploadPath, { recursive: true });
  const filename = Date.now() + "-" + file.originalname;
  const filePath = path.join(uploadPath, filename);
  console.log('=====filepath',filePath);
  
  fs.writeFile(filePath, file.buffer, (err) => {
    if (err) {
      return err;
    }
    file.path = filePath;
    file.filename = filename;
    return embeddingPinecone(filePath);
  });
}