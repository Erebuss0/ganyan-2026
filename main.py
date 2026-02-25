import asyncio
import random 
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient
from backend.game_logic.models import Horse, Race

# ==========================================
# BULUT VERİTABANI (MONGODB) BAĞLANTISI
# ==========================================
MONGO_URI = "mongodb+srv://Erebus:Daedotaekwando579%3F@cluster0.m0zkigz.mongodb.net/?appName=Cluster0"

try:
    client = MongoClient(MONGO_URI)
    db = client["ganyan_db"]
    users_collection = db["users"]
    print("✅ MongoDB Atlas Bağlantısı Başarılı!")
except Exception as e:
    print("❌ MongoDB Bağlantı Hatası:", e)

game = GameManager()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # Yıldız koyarak her yerden girişe izin veriyoruz
    allow_credentials=False,  # Yıldız varken burası False kalmalı
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_user(username):
    return users_collection.find_one({"username": username})

def create_user(username, password):
    users_collection.insert_one({
        "username": username,
        "password": password,
        "balance": 1000,
        "last_reward_time": 0
    })

def update_user_balance(username, new_balance):
    users_collection.update_one({"username": username}, {"$set": {"balance": new_balance}})

def update_user_reward_time(username, reward_time):
    users_collection.update_one({"username": username}, {"$set": {"last_reward_time": reward_time}})

class UserAuth(BaseModel):
    username: str
    password: str

class UpdateBalanceReq(BaseModel):
    username: str
    amount: int
    is_daily_reward: bool = False

class GameManager:
    def __init__(self):
        self.players = {}  
        self.state = "LOBBY" 
        self.race = None
        self.current_weather = "Güneşli"
        
        self.horse_stats = {
            1: {"odds": 3.00, "history": ["-", "-", "-"]},
            2: {"odds": 3.00, "history": ["-", "-", "-"]},
            3: {"odds": 3.00, "history": ["-", "-", "-"]},
            4: {"odds": 3.00, "history": ["-", "-", "-"]},
            5: {"odds": 3.00, "history": ["-", "-", "-"]}
        }
        
    async def connect(self, websocket: WebSocket, name: str):
        existing = get_user(name)
        balance = existing.get("balance", 1000) if existing else 1000

        self.players[websocket] = {"name": name, "ready": False, "balance": balance}
        await self.broadcast_system_message(f"👋 {name} lobiye katıldı!")
        await self.broadcast_players()
        await self.broadcast_leaderboard() 
        await websocket.send_json({"type": "stats_update", "stats": self.horse_stats})

    async def disconnect(self, websocket: WebSocket):
        if websocket in self.players:
            name = self.players[websocket]["name"]
            del self.players[websocket]
            await self.broadcast_system_message(f"🏃 {name} lobiden ayrıldı.")
            await self.broadcast_players()
            await self.broadcast_leaderboard() 
            await self.check_all_ready()

    async def toggle_ready(self, websocket: WebSocket):
        if websocket in self.players and self.state == "LOBBY":
            self.players[websocket]["ready"] = True
            await self.broadcast_players()
            await self.check_all_ready()

    async def update_player_balance(self, websocket: WebSocket, new_balance: int):
        if websocket in self.players:
            name = self.players[websocket]["name"]
            self.players[websocket]["balance"] = new_balance
            update_user_balance(name, new_balance)
            await self.broadcast_leaderboard()

    async def broadcast(self, message: dict):
        for connection in self.players.keys():
            try:
                await connection.send_json(message)
            except:
                pass

    async def broadcast_system_message(self, text: str):
        await self.broadcast({"type": "chat_update", "sender": "SİSTEM", "message": text})

    async def broadcast_players(self):
        player_list = [{"name": p["name"], "ready": p["ready"]} for p in self.players.values()]
        await self.broadcast({"type": "players_update", "players": player_list})

    async def broadcast_stats(self):
        await self.broadcast({"type": "stats_update", "stats": self.horse_stats})

    async def broadcast_leaderboard(self):
        sorted_players = sorted(self.players.values(), key=lambda x: x["balance"], reverse=True)
        leaderboard_data = [{"name": p["name"], "balance": p["balance"]} for p in sorted_players]
        await self.broadcast({"type": "leaderboard_update", "leaderboard": leaderboard_data})

    async def check_all_ready(self):
        if len(self.players) == 0:
            return
            
        all_ready = all(p["ready"] for p in self.players.values())
        
        if all_ready and self.state == "LOBBY":
            self.state = "COUNTDOWN"
            asyncio.create_task(self.start_countdown_and_race())

    async def start_countdown_and_race(self):
        weathers = ["Güneşli", "Güneşli", "Bulutlu", "Yağmurlu"] 
        self.current_weather = random.choice(weathers)
        await self.broadcast_system_message(f"🌤️ Bahisler Kapandı! Anlık Hava Durumu: {self.current_weather}")

        for i in range(5, 0, -1):
            await self.broadcast({"type": "state_update", "state": "COUNTDOWN", "timer": i, "weather": self.current_weather})
            await asyncio.sleep(1)
            
        self.state = "RACING"
        await self.broadcast({"type": "state_update", "state": "RACING"})
        
        def apply_weather(base_pow, is_dirt, is_powerful):
            power = base_pow + random.randint(-10, 10) 
            if self.current_weather == "Yağmurlu":
                if is_powerful: power += 8   
                elif is_dirt: power += 4     
                else: power -= 6             
            elif self.current_weather == "Güneşli":
                if not is_dirt: power += 5   
            return power

        p1 = apply_weather(85, is_dirt=True, is_powerful=False) 
        p2 = apply_weather(85, is_dirt=False, is_powerful=False)
        p3 = apply_weather(85, is_dirt=True, is_powerful=False) 
        p4 = apply_weather(85, is_dirt=True, is_powerful=True)  
        p5 = apply_weather(85, is_dirt=False, is_powerful=False)

        h1 = Horse(1, "Şahbatur", p1, p1, p1, "kacak", "kum")
        h2 = Horse(2, "Gülbatur", p2, p2, p2, "bekleyen", "cim")
        h3 = Horse(3, "Poyraz",   p3, p3, p3, "kacak", "kum")
        h4 = Horse(4, "Kafkaslı", p4, p4, p4, "kacak", "kum")
        h5 = Horse(5, "Yavuzhan", p5, p5, p5, "bekleyen", "cim")
        
        self.race = Race(distance=100)
        for h in [h1, h2, h3, h4, h5]:
            self.race.add_horse(h)

        while not self.race.is_finished:
            self.race.step()
            
            max_pos = max(h.current_position for h in self.race.horses) if self.race.horses else 0
            is_slow_mo = 96 <= max_pos < 100

            winner_odds = 2.0
            if self.race.is_finished and self.race.winner:
                winner_odds = self.horse_stats[self.race.winner.horse_id]["odds"]
                
            race_data = {
                "type": "race_update",
                "is_finished": self.race.is_finished,
                "winner_id": self.race.winner.horse_id if self.race.winner else None,
                "winner_name": self.race.winner.name if self.race.winner else None,
                "winner_odds": winner_odds, 
                "slow_mo": is_slow_mo, 
                "horses": [{"id": h.horse_id, "name": h.name, "position": round(h.current_position, 2)} for h in self.race.horses]
            }
            await self.broadcast(race_data)
            
            if is_slow_mo:
                await asyncio.sleep(0.15) 
            else:
                await asyncio.sleep(0.03)

        ranked_horses = sorted(self.race.horses, key=lambda x: x.current_position, reverse=True)
        for rank, horse in enumerate(ranked_horses, start=1):
            stats = self.horse_stats[horse.horse_id]
            stats["history"].pop(0)
            stats["history"].append(str(rank))
            
            if rank == 1:
                stats["odds"] = max(1.10, round(stats["odds"] - 0.40, 2))
            elif rank == 2:
                stats["odds"] = max(1.10, round(stats["odds"] - 0.15, 2))
            elif rank == 4:
                stats["odds"] = round(stats["odds"] + 0.20, 2)
            elif rank == 5:
                stats["odds"] = min(9.90, round(stats["odds"] + 0.50, 2))
                
            stats["odds"] = round(stats["odds"], 2)

        await self.broadcast_stats()

        self.state = "LOBBY"
        for p in self.players.values():
            p["ready"] = False
        await self.broadcast({"type": "state_update", "state": "FINISHED", "winner": self.race.winner.name})
        await self.broadcast_players()

@app.post("/api/register")
def register_user(user: UserAuth):
    existing = get_user(user.username)
    if existing:
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten alınmış!")
    
    create_user(user.username, user.password)
    return {"message": "Hesap başarıyla oluşturuldu!", "balance": 1000, "last_reward_time": 0}

@app.post("/api/login")
def login_user(user: UserAuth):
    existing = get_user(user.username)
    if not existing:
        raise HTTPException(status_code=400, detail="Böyle bir kullanıcı bulunamadı!")
    
    if existing["password"] != user.password:
        raise HTTPException(status_code=400, detail="Hatalı şifre!")
        
    return {
        "message": "Giriş başarılı!", 
        "balance": existing.get("balance", 1000),
        "last_reward_time": existing.get("last_reward_time", 0)
    }

@app.post("/api/update_balance")
def update_balance_api(req: UpdateBalanceReq):
    existing = get_user(req.username)
    if existing:
        new_balance = existing.get("balance", 1000) + req.amount
        update_user_balance(req.username, new_balance)

        if req.is_daily_reward:
            import time
            new_time = int(time.time() * 1000)
            update_user_reward_time(req.username, new_time)
            return {"new_balance": new_balance, "last_reward_time": new_time}

        return {"new_balance": new_balance, "last_reward_time": existing.get("last_reward_time", 0)}
        
    raise HTTPException(status_code=400, detail="Kullanıcı bulunamadı!")

@app.websocket("/ws/race")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept() 
    try:
        data = await websocket.receive_json()
        name = data.get("name", "Misafir")
        await game.connect(websocket, name)
        while True:
            client_data = await websocket.receive_json()
            action = client_data.get("action")
            
            if action == "chat_message":
                await game.broadcast({"type": "chat_update", "sender": name, "message": client_data.get("message")})
            elif action == "ready":
                await game.toggle_ready(websocket)
            elif action == "update_balance":
                new_balance = client_data.get("balance", 1000)
                await game.update_player_balance(websocket, new_balance)
                    
    except WebSocketDisconnect:
        await game.disconnect(websocket)