import express from 'express';

const router = express.Router();

import bookRouter from './book.routes';

const defaultRoutes = [
  {
    path: '/book',
    route: bookRouter,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

export default router;