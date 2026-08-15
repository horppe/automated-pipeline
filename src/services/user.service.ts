import { prisma } from '../lib/prisma.js';

export const userService = {
  async listUsers() {
    return prisma.user.findMany();
  },

  async createUser(input: { email: string; name?: string }) {
    return prisma.user.create({
      data: input
    });
  }
};
