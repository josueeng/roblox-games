-- Constrói o mapa inteiro por código: base, zonas de coleta, abrigos, penhascos e mar.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Lighting = game:GetService("Lighting")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local Util = require(script.Parent.Util)

local MapBuilder = {}

local W = Config.MAP_WIDTH
local L = Config.MAP_LENGTH
local B = Config.BASE_LENGTH

local function buildShelter(parent, x, z)
	local size = Config.SHELTER_SIZE
	local height = Config.SHELTER_HEIGHT
	local wallColor = Color3.fromRGB(150, 150, 160)

	local model = Instance.new("Model")
	model.Name = "Abrigo"
	model.Parent = parent

	-- Parede voltada para o mar (leste)
	Util.part({
		Name = "ParedeMar",
		Size = Vector3.new(2, height, size),
		Position = Vector3.new(x + size / 2 - 1, height / 2, z),
		Material = Enum.Material.Concrete,
		Color = wallColor,
		Parent = model,
	})
	-- Paredes laterais
	for _, side in ipairs({ -1, 1 }) do
		Util.part({
			Name = "ParedeLateral",
			Size = Vector3.new(size, height, 2),
			Position = Vector3.new(x, height / 2, z + side * (size / 2 - 1)),
			Material = Enum.Material.Concrete,
			Color = wallColor,
			Parent = model,
		})
	end
	-- Teto
	Util.part({
		Name = "Teto",
		Size = Vector3.new(size + 2, 2, size + 2),
		Position = Vector3.new(x, height + 1, z),
		Material = Enum.Material.DiamondPlate,
		Color = Color3.fromRGB(90, 90, 100),
		Parent = model,
	})
	-- Piso verde indicando área segura (entrada voltada para a base, lado oeste)
	Util.part({
		Name = "PisoSeguro",
		Size = Vector3.new(size - 2, 0.2, size - 4),
		Position = Vector3.new(x - 1, 0.1, z),
		Material = Enum.Material.Neon,
		Color = Color3.fromRGB(60, 255, 120),
		Transparency = 0.5,
		CanCollide = false,
		Parent = model,
	})
	-- Farol para achar o abrigo de longe
	local beacon = Util.part({
		Name = "Farol",
		Size = Vector3.new(2, 24, 2),
		Position = Vector3.new(x, height + 14, z),
		Material = Enum.Material.Neon,
		Color = Color3.fromRGB(60, 255, 120),
		CanCollide = false,
		Parent = model,
	})
	Util.billboard(beacon, "🛡 ABRIGO", Color3.fromRGB(120, 255, 160), 14, 600, UDim2.fromOffset(160, 40))

	return {
		position = Vector3.new(x, height / 2, z),
		halfSize = Vector3.new(size / 2, height / 2, size / 2),
	}
end

local function buildBase(parent)
	Util.part({
		Name = "ChaoBase",
		Size = Vector3.new(B, 2, W),
		Position = Vector3.new(-B / 2, -1, 0),
		Material = Enum.Material.Concrete,
		Color = Color3.fromRGB(110, 170, 110),
		Parent = parent,
	})

	-- Muralha com portão: a onda para aqui
	local segment = (W - Config.GATE_WIDTH) / 2
	for _, side in ipairs({ -1, 1 }) do
		Util.part({
			Name = "Muralha",
			Size = Vector3.new(4, 30, segment),
			Position = Vector3.new(-2, 15, side * (Config.GATE_WIDTH / 2 + segment / 2)),
			Material = Enum.Material.Brick,
			Color = Color3.fromRGB(150, 110, 90),
			Parent = parent,
		})
	end
	local arch = Util.part({
		Name = "Arco",
		Size = Vector3.new(4, 6, Config.GATE_WIDTH),
		Position = Vector3.new(-2, 33, 0),
		Material = Enum.Material.Brick,
		Color = Color3.fromRGB(150, 110, 90),
		Parent = parent,
	})
	Util.billboard(arch, "🏠 BASE — ZONA SEGURA", Color3.fromRGB(120, 255, 120), 6, 900, UDim2.fromOffset(360, 60))

	-- Parede do fundo
	Util.part({
		Name = "ParedeFundo",
		Size = Vector3.new(10, 40, W + 20),
		Position = Vector3.new(-B - 5, 20, 0),
		Material = Enum.Material.Rock,
		Color = Color3.fromRGB(100, 100, 100),
		Parent = parent,
	})

	-- Remove spawns do template (ex.: Baseplate) para todos nascerem na base
	for _, descendant in ipairs(workspace:GetDescendants()) do
		if descendant:IsA("SpawnLocation") then
			descendant:Destroy()
		end
	end

	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "Spawn"
	spawn.Anchored = true
	spawn.Size = Vector3.new(14, 1, 14)
	spawn.Position = Vector3.new(-B / 2 - 10, 0.5, 0)
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Material = Enum.Material.Neon
	spawn.Color = Color3.fromRGB(80, 200, 255)
	spawn.TopSurface = Enum.SurfaceType.Smooth
	spawn.Parent = parent

	-- Área de depósito (visual: entrar em qualquer ponto da base deposita)
	local deposit = Util.part({
		Name = "Deposito",
		Size = Vector3.new(16, 0.4, Config.GATE_WIDTH),
		Position = Vector3.new(-10, 0.2, 0),
		Material = Enum.Material.Neon,
		Color = Color3.fromRGB(255, 220, 60),
		Transparency = 0.4,
		CanCollide = false,
		Parent = parent,
	})
	Util.billboard(deposit, "💰 Entre na base para depositar", Color3.fromRGB(255, 230, 120), 5, 150, UDim2.fromOffset(300, 40))

	-- Loja
	local shop = Util.part({
		Name = "Loja",
		Size = Vector3.new(10, 6, 6),
		Position = Vector3.new(-B + 12, 3, -W / 4),
		Material = Enum.Material.WoodPlanks,
		Color = Color3.fromRGB(160, 110, 60),
		Parent = parent,
	})
	Util.part({
		Name = "ToldoLoja",
		Size = Vector3.new(12, 1, 8),
		Position = Vector3.new(-B + 12, 10, -W / 4),
		Material = Enum.Material.Fabric,
		Color = Color3.fromRGB(230, 60, 60),
		Parent = parent,
	})
	Util.billboard(shop, "🛒 LOJA DE MELHORIAS", Color3.fromRGB(255, 255, 255), 9, 200, UDim2.fromOffset(260, 45))

	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Abrir loja"
	prompt.ObjectText = "Loja"
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = 14
	prompt.RequiresLineOfSight = false
	prompt.Parent = shop

	return prompt
end

local function buildZones(parent)
	for _, zone in ipairs(Config.ZONES) do
		local length = zone.endX - zone.startX
		Util.part({
			Name = "Chao_" .. zone.name,
			Size = Vector3.new(length, 2, W),
			Position = Vector3.new(zone.startX + length / 2, -1, 0),
			Material = zone.material,
			Color = zone.groundColor,
			Parent = parent,
		})

		-- Linha divisória e placa no início da zona
		Util.part({
			Name = "Divisa_" .. zone.name,
			Size = Vector3.new(1, 0.2, W),
			Position = Vector3.new(zone.startX + 0.5, 0.1, 0),
			Material = Enum.Material.Neon,
			Color = zone.color,
			CanCollide = false,
			Parent = parent,
		})
		for _, side in ipairs({ -1, 1 }) do
			local post = Util.part({
				Name = "Placa_" .. zone.name,
				Size = Vector3.new(1, 10, 1),
				Position = Vector3.new(zone.startX + 2, 5, side * (W / 2 - 6)),
				Material = Enum.Material.Wood,
				Color = Color3.fromRGB(120, 80, 40),
				Parent = parent,
			})
			Util.billboard(post, zone.name .. " • " .. zone.rarity, zone.color, 7, 400, UDim2.fromOffset(240, 50))
		end
	end
end

local function buildSurroundings(parent)
	-- Penhascos laterais
	for _, side in ipairs({ -1, 1 }) do
		Util.part({
			Name = "Penhasco",
			Size = Vector3.new(L + B + 20, 40, 12),
			Position = Vector3.new((L - B) / 2, 20, side * (W / 2 + 6)),
			Material = Enum.Material.Rock,
			Color = Color3.fromRGB(105, 95, 85),
			Parent = parent,
		})
	end

	-- Mar
	Util.part({
		Name = "Mar",
		Size = Vector3.new(600, 4, W + 600),
		Position = Vector3.new(L + 300, -3, 0),
		Material = Enum.Material.Glass,
		Color = Color3.fromRGB(40, 130, 220),
		Transparency = 0.25,
		Parent = parent,
	})
	-- Barreira invisível na beira do mar
	Util.part({
		Name = "BarreiraMar",
		Size = Vector3.new(2, 60, W),
		Position = Vector3.new(L + 1, 30, 0),
		Transparency = 1,
		Parent = parent,
	})
end

function MapBuilder.build()
	local map = Instance.new("Folder")
	map.Name = "Mapa"
	map.Parent = workspace

	local shopPrompt = buildBase(map)
	buildZones(map)
	buildSurroundings(map)

	local shelterFolder = Instance.new("Folder")
	shelterFolder.Name = "Abrigos"
	shelterFolder.Parent = map

	local shelters = {}
	for _, x in ipairs(Config.SHELTER_X) do
		for _, z in ipairs(Config.SHELTER_Z) do
			table.insert(shelters, buildShelter(shelterFolder, x, z))
		end
	end

	Lighting.ClockTime = 14
	Lighting.Brightness = 2

	return {
		shelters = shelters,
		shopPrompt = shopPrompt,
	}
end

return MapBuilder
