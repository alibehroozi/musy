import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { UserSchemaDefinition, USER_MODEL } from "./user.schema.js";
import { UsersService } from "./users.service.js";
import { UsersRepository } from "./users.repository.js";

@Module({
  imports: [MongooseModule.forFeature([{ name: USER_MODEL, schema: UserSchemaDefinition }])],
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
