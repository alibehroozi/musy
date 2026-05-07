import { Inject, Injectable } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { newUserFromGoogleProfile } from "@moc/api-core";
import { GoogleProfile, User } from "@moc/contracts";
import { UsersRepository } from "./users.repository.js";

@Injectable()
export class UsersService {
  constructor(@Inject(UsersRepository) private readonly repo: UsersRepository) {}

  async findById(id: string): Promise<User | null> {
    return await this.repo.findById(id);
  }

  async findOrCreateByGoogleProfile(profile: GoogleProfile): Promise<User> {
    const existing = await this.repo.findByGoogleId(profile.sub);
    if (existing) return existing;
    const candidate = newUserFromGoogleProfile(profile, {
      newId: () => uuidv4(),
      now: () => new Date(),
    });
    return await this.repo.create(candidate);
  }
}
