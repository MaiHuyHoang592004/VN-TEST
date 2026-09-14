import { Module } from "@nestjs/common";
import { FulfillmentCommandController } from "./fulfillments/fulfillment-command.controller.js";

@Module({ controllers: [FulfillmentCommandController] })
export class OperatorModule {}
