import random

class Horse:
    def __init__(self, horse_id, name, speed_base, stamina, sprint, run_style, track_preference):
        self.horse_id = horse_id
        self.name = name
        self.speed_base = speed_base       # Ortalama hızı
        self.stamina = stamina             # Dayanıklılık
        self.sprint = sprint               # Son düzlükte atak gücü
        self.run_style = run_style         # 'kacak', 'bekleyen'
        self.track_preference = track_preference # 'cim', 'kum'
        self.current_position = 0.0        # Atın anlık konumu (metre)

    def move(self):
        luck_factor = random.uniform(0.8, 1.2)
        step = (self.speed_base / 350) * luck_factor 
        self.current_position += step
        return self.current_position

class Race:
    def __init__(self, distance):
        self.distance = distance
        self.horses = []
        self.is_finished = False
        self.winner = None

    def add_horse(self, horse):
        self.horses.append(horse)

    def step(self):
        """Yarışı 1 an (adım) ilerletir ve lideri kontrol eder."""
        if self.is_finished:
            return

        for horse in self.horses:
            horse.move()
            # Bitiş çizgisini geçti mi?
            if horse.current_position >= self.distance:
                self.is_finished = True
                if self.winner is None:
                    self.winner = horse