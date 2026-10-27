-- Carrega, guarda e salva os dados dos jogadores (DataStore).
-- Cada campo também vira um atributo do Player para o cliente ler,
-- e alguns aparecem no placar (leaderstats).

local DataStoreService = game:GetService("DataStoreService")

local PlayerData = {}

local DEFAULTS = {
	Coins = 0,
	Waves = 0,
	SpeedLevel = 0,
	CapacityLevel = 0,
}

local LEADERSTATS = {
	Coins = "Moedas",
	Waves = "Ondas",
}

local store
do
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore("FujaDoTsunami_v1")
	end)
	if ok then
		store = result
	else
		warn("[PlayerData] DataStore indisponível, progresso não será salvo:", result)
	end
end

local cache = {}

function PlayerData.load(player)
	local data = table.clone(DEFAULTS)

	if store then
		local ok, saved = pcall(function()
			return store:GetAsync("player_" .. player.UserId)
		end)
		if ok and type(saved) == "table" then
			for key, value in pairs(saved) do
				if DEFAULTS[key] ~= nil and type(value) == "number" then
					data[key] = value
				end
			end
		elseif not ok then
			warn("[PlayerData] Falha ao carregar dados de", player.Name, saved)
		end
	end

	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	for key, label in pairs(LEADERSTATS) do
		local value = Instance.new("IntValue")
		value.Name = label
		value.Value = data[key]
		value.Parent = leaderstats
	end
	leaderstats.Parent = player

	for key, value in pairs(data) do
		player:SetAttribute(key, value)
	end

	cache[player] = data
	return data
end

function PlayerData.get(player, key)
	local data = cache[player]
	return data and data[key]
end

function PlayerData.set(player, key, value)
	local data = cache[player]
	if not data then
		return
	end
	data[key] = value
	player:SetAttribute(key, value)

	local label = LEADERSTATS[key]
	local leaderstats = player:FindFirstChild("leaderstats")
	local stat = label and leaderstats and leaderstats:FindFirstChild(label)
	if stat then
		stat.Value = value
	end
end

function PlayerData.increment(player, key, amount)
	local current = PlayerData.get(player, key)
	if current then
		PlayerData.set(player, key, current + amount)
	end
end

function PlayerData.save(player)
	local data = cache[player]
	if not (store and data) then
		return
	end
	local ok, err = pcall(function()
		store:SetAsync("player_" .. player.UserId, data)
	end)
	if not ok then
		warn("[PlayerData] Falha ao salvar dados de", player.Name, err)
	end
end

function PlayerData.release(player)
	PlayerData.save(player)
	cache[player] = nil
end

function PlayerData.all()
	return cache
end

return PlayerData
