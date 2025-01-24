const { v4: uuidv4 } = require('uuid'); 

const port = process.env.PORT || 3000;
const http = require("http");
const WebSocket = require("ws");
const redis = require("redis");

const server = http.createServer();

const wss = new WebSocket.Server({ server });

const redisClient = redis.createClient({
    url: "redis://redis:6379",
});

const redisSubscriber = redisClient.duplicate();

redisClient.connect();
redisSubscriber.connect();

const userSocketMap = {};

const sendMessageToRoom = async (room, message) => {
    const socketsId = await redisClient.sMembers(room);
    console.log("[chat-messages] socketsId", socketsId);

    for (const socketId of socketsId) {
        const socket = userSocketMap[socketId];
        if (socket) {
            console.log(
                `[chat-messages] enviando mensagem para o socket de id ${socketId}`
            );
            socket.send(JSON.stringify({ type: "newMessage", message }));
        }
    }
};

wss.on("connection", (ws) => {
    const clientId = uuidv4();
    console.log(`Novo cliente conectado com id: ${clientId}`);

    ws.clientId = clientId;

    userSocketMap[clientId] = ws;

    ws.on("message", (data) => {
        const parsedData = JSON.parse(data);

        switch (parsedData.type) {
            case "sendChatMessage":
                const { chatId, message } = parsedData;
                redisClient.publish(
                    "chat-messages",
                    JSON.stringify({ chatId, message })
                );
                break;

            case "enterChat":
                const { chatId: enterChatId } = parsedData;
                const room = `chat-${enterChatId}`;
                console.log(
                    `[enterChat] Socket ${ws.clientId} entrando na sala ${room}`
                );

                redisClient.sAdd(room, ws.clientId);
                break;

            case "leaveChat":
                const { chatId: leaveChatId } = parsedData;
                const roomLeave = `chat-${leaveChatId}`;
                console.log(
                    `[leaveChat] Socket ${ws.clientId} saindo da sala ${roomLeave}`
                );

                ws.leave(roomLeave);
                redisClient.sRem(roomLeave, ws.clientId);
                break;

            default:
                console.log("Tipo de mensagem não reconhecido.");
        }
    });

    // Salvar o WebSocket de cada cliente para mapeamento
    ws.on("close", () => {
        for (let userId in userSocketMap) {
            if (userSocketMap[userId] === ws) {
                redisClient.hDel("userSocketMap", userId);
                delete userSocketMap[userId];
            }
        }
    });

    ws.on("register", (userId) => {
        console.log(`Usuário registrado: ${userId}`);
        userSocketMap[userId] = ws;
        redisClient.hSet("userSocketMap", userId, ws.clientId);
    });
});

redisSubscriber.subscribe("chat-messages", async (data) => {
    console.log("[chat-messages] data", data);

    const { chatId, message: chatMessage } = JSON.parse(data);
    const room = `chat-${chatId}`;

    await sendMessageToRoom(room, chatMessage);
});

server.listen(port, () => {
    console.log("Servidor WebSocket rodando na porta ", port);
});
