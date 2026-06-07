import { Router, type IRouter } from "express";
import healthRouter from "./health";
import alertsRouter from "./alerts";
import intelRouter from "./intel";

const router: IRouter = Router();

router.use(healthRouter);
router.use(alertsRouter);
router.use(intelRouter);

export default router;
