import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { normalizeEmail } from "@moc/api-core";
import { User } from "@moc/contracts";
import { UserDocument, USER_MODEL } from "./user.schema.js";

@Injectable()
export class UsersService {
  constructor(@InjectModel(USER_MODEL) private readonly model: Model<UserDocument>) {}

  async createOrFindByEmail(rawEmail: string): Promise<User> {
    const email = normalizeEmail(rawEmail);
    const existing = await this.model.findOne({ email }).lean().exec();
    if (existing) {
      return User.parse({
        id: existing.id,
        email: existing.email,
        createdAt: existing.createdAt.toISOString(),
      });
    }
    const created = await this.model.create({ id: uuidv4(), email });
    return User.parse({
      id: created.id,
      email: created.email,
      createdAt: created.createdAt.toISOString(),
    });
  }
}
