--[[
	Configurações do jogo "Fuja do Tsunami".
	Compartilhado entre servidor e cliente (ReplicatedStorage.Shared.Config).

	O mapa é uma faixa ao longo do eixo X:
	  X < 0               -> Base (zona segura, onde os itens são depositados)
	  0 .. MAP_LENGTH     -> Zonas de coleta (quanto mais longe, mais valiosos os itens)
	  X > MAP_LENGTH      -> Mar (de onde vêm os desastres)
]]

local Config = {}

-- Mapa ------------------------------------------------------------------------
Config.MAP_LENGTH = 900
Config.MAP_WIDTH = 120
Config.BASE_LENGTH = 70
Config.GATE_WIDTH = 36

-- Abrigos: posições X das fileiras e Z de cada abrigo na fileira
Config.SHELTER_X = { 170, 330, 490, 640, 790 }
Config.SHELTER_Z = { -28, 28 }
Config.SHELTER_SIZE = 18
Config.SHELTER_HEIGHT = 12

-- Ciclo dos desastres (segundos) ---------------------------------------------
Config.INTERMISSION = 25
Config.WARNING_TIME = 7
Config.RESPAWN_TIME = 3

-- Recompensa por sobreviver a uma onda
Config.SURVIVE_BONUS = 15

-- Desastres -------------------------------------------------------------------
Config.DISASTERS = {
	{
		name = "Tsunami",
		speed = 45,
		height = 50,
		color = Color3.fromRGB(30, 120, 210),
		foamColor = Color3.fromRGB(235, 250, 255),
		material = Enum.Material.SmoothPlastic,
		transparency = 0.2,
		weight = 5,
	},
	{
		name = "Mega Tsunami",
		speed = 68,
		height = 80,
		color = Color3.fromRGB(15, 70, 160),
		foamColor = Color3.fromRGB(200, 230, 255),
		material = Enum.Material.SmoothPlastic,
		transparency = 0.15,
		weight = 2,
	},
	{
		name = "Onda de Lava",
		speed = 32,
		height = 40,
		color = Color3.fromRGB(255, 90, 20),
		foamColor = Color3.fromRGB(255, 220, 60),
		material = Enum.Material.Neon,
		transparency = 0.05,
		weight = 2,
	},
	{
		name = "Avalanche de Lama",
		speed = 38,
		height = 45,
		color = Color3.fromRGB(110, 75, 45),
		foamColor = Color3.fromRGB(160, 120, 80),
		material = Enum.Material.Mud,
		transparency = 0,
		weight = 2,
	},
}

-- Zonas e itens ---------------------------------------------------------------
-- weight = chance relativa de aparecer dentro da zona
Config.ZONES = {
	{
		name = "Praia",
		rarity = "Comum",
		startX = 0,
		endX = 240,
		color = Color3.fromRGB(120, 220, 120),
		groundColor = Color3.fromRGB(235, 215, 160),
		material = Enum.Material.Sand,
		maxItems = 30,
		items = {
			{ name = "Concha", value = 5, weight = 60, color = Color3.fromRGB(255, 200, 200), shape = Enum.PartType.Ball },
			{ name = "Estrela-do-mar", value = 8, weight = 30, color = Color3.fromRGB(255, 140, 60), shape = Enum.PartType.Block },
			{ name = "Garrafa com Mensagem", value = 15, weight = 10, color = Color3.fromRGB(120, 200, 140), shape = Enum.PartType.Cylinder },
		},
	},
	{
		name = "Dunas",
		rarity = "Raro",
		startX = 240,
		endX = 470,
		color = Color3.fromRGB(80, 160, 255),
		groundColor = Color3.fromRGB(210, 170, 110),
		material = Enum.Material.Sand,
		maxItems = 24,
		items = {
			{ name = "Âmbar", value = 20, weight = 55, color = Color3.fromRGB(255, 170, 30), shape = Enum.PartType.Ball },
			{ name = "Fóssil", value = 30, weight = 30, color = Color3.fromRGB(230, 225, 210), shape = Enum.PartType.Block },
			{ name = "Bússola Antiga", value = 45, weight = 15, color = Color3.fromRGB(190, 140, 70), shape = Enum.PartType.Cylinder },
		},
	},
	{
		name = "Rochedo",
		rarity = "Épico",
		startX = 470,
		endX = 700,
		color = Color3.fromRGB(190, 100, 255),
		groundColor = Color3.fromRGB(120, 115, 110),
		material = Enum.Material.Rock,
		maxItems = 18,
		items = {
			{ name = "Cristal", value = 60, weight = 55, color = Color3.fromRGB(170, 120, 255), shape = Enum.PartType.Block },
			{ name = "Pepita de Ouro", value = 90, weight = 30, color = Color3.fromRGB(255, 215, 0), shape = Enum.PartType.Ball },
			{ name = "Coroa Pirata", value = 150, weight = 15, color = Color3.fromRGB(255, 190, 40), shape = Enum.PartType.Cylinder },
		},
	},
	{
		name = "Recife",
		rarity = "Lendário",
		startX = 700,
		endX = 900,
		color = Color3.fromRGB(255, 200, 40),
		groundColor = Color3.fromRGB(240, 140, 150),
		material = Enum.Material.Slate,
		maxItems = 12,
		items = {
			{ name = "Pérola Negra", value = 200, weight = 55, color = Color3.fromRGB(40, 40, 50), shape = Enum.PartType.Ball },
			{ name = "Tridente", value = 350, weight = 30, color = Color3.fromRGB(80, 230, 230), shape = Enum.PartType.Cylinder },
			{ name = "Coração do Oceano", value = 600, weight = 15, color = Color3.fromRGB(30, 90, 255), shape = Enum.PartType.Ball },
		},
	},
}

Config.ITEM_RESPAWN_INTERVAL = 2

-- Melhorias -------------------------------------------------------------------
Config.UPGRADE_ORDER = { "Speed", "Capacity" }
Config.UPGRADES = {
	Speed = {
		name = "Velocidade",
		description = "Corra mais rápido que a onda!",
		dataKey = "SpeedLevel",
		base = 16,
		perLevel = 3,
		maxLevel = 10,
		baseCost = 50,
		costMultiplier = 1.6,
	},
	Capacity = {
		name = "Mochila",
		description = "Carregue mais itens por viagem.",
		dataKey = "CapacityLevel",
		base = 3,
		perLevel = 1,
		maxLevel = 12,
		baseCost = 40,
		costMultiplier = 1.5,
	},
}

function Config.getUpgradeValue(key, level)
	local upgrade = Config.UPGRADES[key]
	return upgrade.base + upgrade.perLevel * level
end

function Config.getUpgradeCost(key, level)
	local upgrade = Config.UPGRADES[key]
	return math.floor(upgrade.baseCost * upgrade.costMultiplier ^ level)
end

function Config.getZoneAt(x)
	for _, zone in ipairs(Config.ZONES) do
		if x >= zone.startX and x < zone.endX then
			return zone
		end
	end
	return nil
end

return Config
