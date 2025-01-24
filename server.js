const port = process.env.PORT || 3000;
const http = require("http");
const socketIo = require("socket.io");
const redis = require("redis");

const server = http.createServer();
const io = socketIo(server);

const redisClient = redis.createClient({
    url: "redis://redis:6379",
});

const redisSubscriber = redisClient.duplicate();

redisClient.connect();
redisSubscriber.connect();

io.on("connection", (socket) => {
    console.log("Usuário conectado: " + socket.id);

    socket.on("sendChatMessage", (data) => {
        const { chatId, message } = data;

        redisClient.publish(
            "chat-messages",
            JSON.stringify({ chatId, message })
        );
    });

    socket.on("enterChat", (data) => {
        console.log("[enterChat] ", data);

        const { chatId } = data;

        const room = `chat-${chatId}`;

        console.log(`[enterChat] Socket ${socket.id} entrando na sala ${room}`);
        socket.join(room);
        redisClient.sAdd(room, socket.id);
    });

    socket.on("leaveChat", (data) => {
        console.log("[leaveChat] ", data);

        const { chatId } = data;

        const room = `chat-${chatId}`;

        console.log(`[leaveChat] Socket ${socket.id} saindo da sala ${room}`);

        socket.leave(room);
        redisClient.sRem(room, socket.id);
    });
});

redisSubscriber.subscribe("chat-messages", async (data, channel) => {
    console.log("[chat-messages] data", data);

    const { chatId, message: chatMessage } = JSON.parse(data);

    const room = `chat-${chatId}`;

    const socketsId = await redisClient.sMembers(room);

    console.log("socketsId ", socketsId);

    for (const socketId of socketsId ?? []) {
        console.log(
            `[chat-messages] enviarei mensagem para o socket de id ${socketId}`
        );

        io.to(socketId).emit("newMessage", chatMessage);
    }
});

server.listen(port, () => {
    console.log("Servidor Socket.IO rodando na porta ", port);
});
