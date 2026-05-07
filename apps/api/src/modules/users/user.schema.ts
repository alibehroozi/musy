import { Schema, Document } from "mongoose";

export const USER_MODEL = "User";

export interface UserDocument extends Document {
  id: string;
  email: string;
  googleId: string;
  createdAt: Date;
}

export const UserSchemaDefinition = new Schema<UserDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    googleId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: "users", versionKey: false },
);
