const { ApolloServer, gql } = require('apollo-server-express');
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const app = express();

const typeDefs = gql`
  type User {
    id: ID!
    email: String!
    posts: [Post!]!
    comments: [Comment!]!
  }

  type Post {
    id: ID!
    title: String!
    content: String!
    author: User!
    comments: [Comment!]!
  }

  type Comment {
    id: ID!
    content: String!
    author: User!
    post: Post!
  }

  type Query {
    users: [User!]!
    posts: [Post!]!
    comments: [Comment!]!
  }

  type Mutation {
    signUp(email: String!, password: String!): String!
    login(email: String!, password: String!): String!
    createPost(title: String!, content: String!): Post!
    updatePost(id: ID!, title: String, content: String): Post!
    deletePost(id: ID!): Post!
    addComment(postId: ID!, content: String!): Comment!
  }
`;

const resolvers = {
  Query: {
    users: () => prisma.user.findMany(),
    posts: () => prisma.post.findMany(),
    comments: () => prisma.comment.findMany(),
  },
  Mutation: {
    signUp: async (_, { email, password }) => {
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { email, password: hashedPassword },
      });
      return jwt.sign({ userId: user.id }, 'SECRET_KEY');
    },
    login: async (_, { email, password }) => {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        throw new Error('No such user found');
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        throw new Error('Invalid password');
      }
      return jwt.sign({ userId: user.id }, 'SECRET_KEY');
    },
    createPost: async (_, { title, content }, context) => {
      const userId = getUserId(context);
      if (!userId) throw new Error('Not authenticated');
      return prisma.post.create({
        data: {
          title,
          content,
          author: { connect: { id: userId } },
        },
      });
    },
    updatePost: async (_, { id, title, content }, context) => {
      const userId = getUserId(context);
      if (!userId) throw new Error('Not authenticated');
      return prisma.post.update({
        where: { id: parseInt(id) },
        data: { title, content },
      });
    },
    deletePost: async (_, { id }, context) => {
      const userId = getUserId(context);
      if (!userId) throw new Error('Not authenticated');
      return prisma.post.delete({ where: { id: parseInt(id) } });
    },
    addComment: async (_, { postId, content }, context) => {
      const userId = getUserId(context);
      if (!userId) throw new Error('Not authenticated');
      return prisma.comment.create({
        data: {
          content,
          post: { connect: { id: parseInt(postId) } },
          author: { connect: { id: userId } },
        },
      });
    },
  },
  User: {
    posts: (parent) => prisma.user.findUnique({ where: { id: parent.id } }).posts(),
    comments: (parent) => prisma.user.findUnique({ where: { id: parent.id } }).comments(),
  },
  Post: {
    author: (parent) => prisma.post.findUnique({ where: { id: parent.id } }).author(),
    comments: (parent) => prisma.post.findUnique({ where: { id: parent.id } }).comments(),
  },
  Comment: {
    author: (parent) => prisma.comment.findUnique({ where: { id: parent.id } }).author(),
    post: (parent) => prisma.comment.findUnique({ where: { id: parent.id } }).post(),
  },
};

const getUserId = (context) => {
  const Authorization = context.req.get('Authorization');
  if (Authorization) {
    const token = Authorization.replace('Bearer ', '');
    const { userId } = jwt.verify(token, 'SECRET_KEY');
    return userId;
  }
  return null;
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => ({ req, prisma }),
});

server.start().then(() => {
  server.applyMiddleware({ app });
  app.listen({ port: 4000 }, () =>
    console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`)
  );
});
