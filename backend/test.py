from game_logic.models import Horse, Race
import time
import os

# 3 tane at oluşturalım
horse1 = Horse(1, "Şahbatur", 85, 90, 80, "kacak", "kum")
horse2 = Horse(2, "Gülbatur", 82, 85, 95, "bekleyen", "cim")
horse3 = Horse(3, "Poyraz", 88, 80, 85, "kacak", "kum")

# 100 metrelik kısa bir yarış kuralım
my_race = Race(distance=100)
my_race.add_horse(horse1)
my_race.add_horse(horse2)
my_race.add_horse(horse3)

print("🏇 YARIŞ BAŞLIYOR! 🏇\n")
time.sleep(1)

# Yarış bitene kadar döngüyü çalıştır
while not my_race.is_finished:
    os.system('cls' if os.name == 'nt' else 'clear') # Ekranı temizle
    print("--- CANLI YARIŞ ---\n")
    
    my_race.step() # Atları hareket ettir
    
    # Atların anlık durumunu ekrana yazdır
    for h in my_race.horses:
        bar = "=" * int(h.current_position / 5) + "🐎"
        print(f"{h.name[:8]:8} | {bar} ({h.current_position:.1f}m)")
    
    time.sleep(0.5) # Yarışı izleyebilmek için yarım saniye bekle

print(f"\n🏆 YARIŞ BİTTİ! KAZANAN: {my_race.winner.name.upper()} 🏆")