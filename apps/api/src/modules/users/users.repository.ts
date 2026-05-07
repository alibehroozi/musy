import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User } from "@moc/contracts";
import { USER_MODEL, UserDocument } from "./user.schema.js";

/**
 * The only place that imports `Model<UserDocument>`. Returns plain User
 * objects parsed through the shared Zod schema — Mongoose stays contained.
 */
@Injectable()
export class UsersRepository {
  constructor(@InjectModel(USER_MODEL) private readonly model: Model<UserDocument>) {}

  async findById(id: string): Promise<User | null> {
    const doc = await this.model.findOne({ id }).lean().exec();
    return doc ? this.toUser(doc) : null;
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    const doc = await this.model.findOne({ googleId }).lean().exec();
    return doc ? this.toUser(doc) : null;
  }

  async create(user: User): Promise<User> {
    const created = await this.model.create({
      id: user.id,
      email: user.email,
      googleId: user.googleId,
      createdAt: new Date(user.createdAt),
    });
    return this.toUser(created.toObject());
  }

  private toUser(doc: { id: string; email: string; googleId: string; createdAt: Date }): User {
    return User.parse({
      id: doc.id,
      email: doc.email,
      googleId: doc.googleId,
      createdAt: doc.createdAt.toISOString(),
    });
  }
}
