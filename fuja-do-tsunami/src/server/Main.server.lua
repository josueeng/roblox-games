--[[
	Fuja do Tsunami — script principal do servidor.

	Loop do jogo:
	  1. Calmo:  jogadores correm pelas zonas coletando itens.
	  2. Alerta: aviso de que um desastre está chegando.
	  3. Onda:   a onda varre o mapa do mar até a base. Quem não estiver
	             na base ou em um abrigo é atingido e perde os itens carregados.
	Itens só viram moedas quando o jogador volta para a base.
	Moedas compram melhorias de velocidade e de mochila.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local MapBuilder = require(script.Parent.MapBuilder)
local ItemSpawner = require(script.Parent.ItemSpawner)
local DisasterManager = require(script.Parent.DisasterManager)
local PlayerData = require(script.Parent.PlayerData)

Players.RespawnTime = Config.RESPAWN_TIME

-- Remotes ---------------------------------------------------------------------
local remotes = Instance.new("Folder")
remotes.Name = "Remotes"

local buyUpgrade = Instance.new("RemoteFunction")
buyUpgrade.Name = "BuyUpgrade"
buyUpgrade.Parent = remotes

local notify = Instance.new("RemoteEvent")
notify.Name = "Notify"
notify.Parent = remotes

local openShop = Instance.new("RemoteEvent")
openShop.Name = "OpenShop"
openShop.Parent = remotes

remotes.Parent = ReplicatedStorage

local function send(player, text, color)
	notify:FireClient(player, text, color or Color3.new(1, 1, 1))
end

local function sendAll(text, color)
	notify:FireAllClients(text, color or Color3.new(1, 1, 1))
end

local function setState(phase, timeLeft, disasterName)
	ReplicatedStorage:SetAttribute("Phase", phase)
	ReplicatedStorage:SetAttribute("TimeLeft", timeLeft)
	ReplicatedStorage:SetAttribute("Disaster", disasterName or "")
end

-- Mapa ------------------------------------------------------------------------
local map = MapBuilder.build()

local function isInBase(position)
	return position.X < 0
end

local function isInShelter(position)
	for _, shelter in ipairs(map.shelters) do
		local offset = position - shelter.position
		if
			math.abs(offset.X) <= shelter.halfSize.X
			and math.abs(offset.Z) <= shelter.halfSize.Z
			and position.Y <= shelter.position.Y + shelter.halfSize.Y
		then
			return true
		end
	end
	return false
end

local function isSafe(position)
	return isInBase(position) or isInShelter(position)
end

map.shopPrompt.Triggered:Connect(function(player)
	openShop:FireClient(player)
end)

-- Mochila (itens carregados, perdidos ao morrer) ------------------------------
local function setCarried(player, count, value)
	player:SetAttribute("Carried", count)
	player:SetAttribute("CarriedValue", value)
end

local function maxCarry(player)
	return Config.getUpgradeValue("Capacity", PlayerData.get(player, "CapacityLevel") or 0)
end

local function applyUpgrades(player)
	player:SetAttribute("MaxCarry", maxCarry(player))
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if humanoid then
		humanoid.WalkSpeed = Config.getUpgradeValue("Speed", PlayerData.get(player, "SpeedLevel") or 0)
	end
end

local fullWarningAt = {}

local function onPickup(player, item)
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not humanoid or humanoid.Health <= 0 then
		return false
	end

	local carried = player:GetAttribute("Carried") or 0
	if carried >= maxCarry(player) then
		if os.clock() - (fullWarningAt[player] or 0) > 2 then
			fullWarningAt[player] = os.clock()
			send(player, "🎒 Mochila cheia! Volte para a base para depositar.", Color3.fromRGB(255, 180, 80))
		end
		return false
	end

	local value = item:GetAttribute("Value") or 0
	setCarried(player, carried + 1, (player:GetAttribute("CarriedValue") or 0) + value)
	send(player, string.format("+ %s (💰 %d)", item.Name, value), Color3.fromRGB(150, 255, 150))
	return true
end

ItemSpawner.init(map.shelters, onPickup)

-- Jogadores -------------------------------------------------------------------
local diedThisWave = {}

local function onCharacterAdded(player, character)
	setCarried(player, 0, 0)
	local humanoid = character:WaitForChild("Humanoid")
	applyUpgrades(player)

	humanoid.Died:Connect(function()
		diedThisWave[player] = true
		local lost = player:GetAttribute("Carried") or 0
		if lost > 0 then
			send(player, string.format("💀 Você perdeu %d itens!", lost), Color3.fromRGB(255, 90, 90))
		end
		setCarried(player, 0, 0)
	end)
end

local function onPlayerAdded(player)
	PlayerData.load(player)
	setCarried(player, 0, 0)
	player:SetAttribute("MaxCarry", maxCarry(player))

	player.CharacterAdded:Connect(function(character)
		onCharacterAdded(player, character)
	end)
	if player.Character then
		task.spawn(onCharacterAdded, player, player.Character)
	end
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in ipairs(Players:GetPlayers()) do
	task.spawn(onPlayerAdded, player)
end

Players.PlayerRemoving:Connect(function(player)
	PlayerData.release(player)
	fullWarningAt[player] = nil
	diedThisWave[player] = nil
end)

game:BindToClose(function()
	for _, player in ipairs(Players:GetPlayers()) do
		PlayerData.save(player)
	end
end)

task.spawn(function()
	while true do
		task.wait(60)
		for _, player in ipairs(Players:GetPlayers()) do
			PlayerData.save(player)
		end
	end
end)

-- Depósito automático ao entrar na base --------------------------------------
task.spawn(function()
	while true do
		task.wait(0.25)
		for _, player in ipairs(Players:GetPlayers()) do
			local value = player:GetAttribute("CarriedValue") or 0
			local character = player.Character
			local root = character and character:FindFirstChild("HumanoidRootPart")
			if value > 0 and root and isInBase(root.Position) and PlayerData.get(player, "Coins") then
				PlayerData.increment(player, "Coins", value)
				send(player, string.format("💰 +%d moedas depositadas!", value), Color3.fromRGB(255, 220, 60))
				setCarried(player, 0, 0)
			end
		end
	end
end)

-- Loja ------------------------------------------------------------------------
buyUpgrade.OnServerInvoke = function(player, key)
	local upgrade = type(key) == "string" and Config.UPGRADES[key]
	if not upgrade then
		return false, "Melhoria inválida."
	end

	local level = PlayerData.get(player, upgrade.dataKey)
	local coins = PlayerData.get(player, "Coins")
	if not (level and coins) then
		return false, "Dados ainda carregando."
	end
	if level >= upgrade.maxLevel then
		return false, "Nível máximo!"
	end

	local cost = Config.getUpgradeCost(key, level)
	if coins < cost then
		return false, string.format("Faltam %d moedas.", cost - coins)
	end

	PlayerData.increment(player, "Coins", -cost)
	PlayerData.set(player, upgrade.dataKey, level + 1)
	applyUpgrades(player)
	return true, string.format("%s nível %d!", upgrade.name, level + 1)
end

-- Loop principal --------------------------------------------------------------
local function onWaveHit(player)
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if humanoid and humanoid.Health > 0 then
		humanoid.Health = 0
	end
end

while true do
	for t = Config.INTERMISSION, 1, -1 do
		setState("Calmo", t)
		task.wait(1)
	end

	local disaster = DisasterManager.pick()
	sendAll(string.format("⚠ %s chegando! Corra para um ABRIGO ou para a BASE!", disaster.name), Color3.fromRGB(255, 80, 80))
	for t = Config.WARNING_TIME, 1, -1 do
		setState("Alerta", t, disaster.name)
		task.wait(1)
	end

	table.clear(diedThisWave)
	local participants = Players:GetPlayers()

	setState("Onda", 0, disaster.name)
	DisasterManager.runWave(disaster, isSafe, onWaveHit)

	for _, player in ipairs(participants) do
		local character = player.Parent and player.Character
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		if humanoid and humanoid.Health > 0 and not diedThisWave[player] and PlayerData.get(player, "Coins") then
			PlayerData.increment(player, "Waves", 1)
			PlayerData.increment(player, "Coins", Config.SURVIVE_BONUS)
			send(player, string.format("🏆 Você sobreviveu ao %s! +%d moedas", disaster.name, Config.SURVIVE_BONUS), Color3.fromRGB(120, 220, 255))
		end
	end
end
