import { Router, type IRouter } from "express";
import healthRouter from "./health";
import blindTestsRouter from "./blind-tests-persistent";

const router: IRouter = Router();

router.use(healthRouter);
router.use(blindTestsRouter);

export default router;
