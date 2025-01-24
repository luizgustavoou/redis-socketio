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

redisClient.on("connect", () => {
    console.log("Redis is ready!");
});

redisClient.on("error", (e) => {
    console.log("Redis error ", e);
});

const userSocketMap = {};
redisClient.set("key", "value");
console.log("userSocketMap ", userSocketMap);

io.on("connection", (socket) => {
    console.log("Usuário conectado: " + socket.id);

    socket.on("register", (userId) => {
        console.log(`Usuário registrado: ${userId}`);
        userSocketMap[userId] = socket.id;

        console.log("[REGISTER] userSocketMap ", userSocketMap);

        redisClient.hSet("userSocketMap", userId, socket.id);
    });

    socket.on("sendMessage", (data) => {
        const { userId, message } = data;
        const targetSocketId = userSocketMap[userId];

        if (targetSocketId) {
            console.log("Enviar mensagem diretamente");
            io.to(targetSocketId).emit("receiveMessage", message);
        } else {
            console.log("Usuário não encontrado, publicando no Redis.");
            redisClient.publish(
                "user-messages",
                JSON.stringify({ userId, message })
            );
        }
    });

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

        socket.join(room);
        redisClient.sadd(room, socket.id);
    });

    socket.on("disconnect", () => {
        console.log("Usuário desconectado: " + socket.id);
        for (let userId in userSocketMap) {
            if (userSocketMap[userId] === socket.id) {
                redisClient.hdel("userSocketMap", userId);
                delete userSocketMap[userId];
            }
        }
    });
});

redisSubscriber.subscribe("user-messages", async (data, channel) => {
    console.log("[user-messages] data", data);
    const { userId, message } = JSON.parse(data);
    const targetSocketId = userSocketMap[userId];

    if (targetSocketId) {
        io.to(targetSocketId).emit("receiveMessage", message);
    } else {
        console.log(`Usuário ${userId} ainda não está conectado.`);
    }
});

redisSubscriber.subscribe("chat-messages", async (data, channel) => {
    console.log("[chat-messages] data", data);

    const { chatId, message: chatMessage } = JSON.parse(data);

    const socketsId = await redisClient.sMembers(`chat-${chatId}`);

    console.log("socketsId ", socketsId);
});

server.listen(port, () => {
    console.log("Servidor Socket.IO rodando na porta ", port);
});
