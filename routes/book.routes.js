import express from 'express';
// import passport from 'passport';
const multer = require('multer');
import { catchAsync } from '../utils/catchAsync';
import { recommendBook, uploadFile } from '../controllers/book.controller';
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post(
  '/recommendBook',
  catchAsync(async (req, res) => {
    console.log('/api/book/recommendBook called -------');
    res.status(200).json(await recommendBook(req));
  })
);

router.post('/upload', upload.single('file'), catchAsync(async (req, res) => {
  res.status(200).json(await uploadFile(req.file))
}))

export default router;