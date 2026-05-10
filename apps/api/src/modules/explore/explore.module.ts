import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { SWIPES_MODEL, SwipesSchemaDefinition } from "./explore.schema.js";
import { SwipesRepository } from "./explore.repository.js";
import { ExploreService } from "./explore.service.js";
import { ExploreController } from "./explore.controller.js";
import { SearchModule } from "../search/search.module.js";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SWIPES_MODEL, schema: SwipesSchemaDefinition }]),
    SearchModule,
  ],
  controllers: [ExploreController],
  providers: [ExploreService, SwipesRepository],
})
export class ExploreModule {}
