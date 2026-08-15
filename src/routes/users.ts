import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { userService } from '../services/user.service.js';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional()
});

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => {
    return userService.listUsers();
  });

  fastify.post('/', async (request, reply) => {
    const body = createUserSchema.parse(request.body);
    const user = await userService.createUser(body);
    return reply.code(201).send(user);
  });
};
