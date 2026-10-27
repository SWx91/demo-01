import { Module } from '@nestjs/common';
import { StoreProductsController } from './store-products.controller.js';

@Module({ controllers: [StoreProductsController] })
export class StoreProductsModule {}
