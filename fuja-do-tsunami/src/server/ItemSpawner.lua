-- Gera itens colecionáveis nas zonas e chama onPickup quando um jogador encosta neles.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local Util = require(script.Parent.Util)

local ItemSpawner = {}

local itemsFolder
local shelters = {}
local onPickup
local countByZone = {}

local function isNearShelter(position)
	for _, shelter in ipairs(shelters) do
		local offset = position - shelter.position
		if math.abs(offset.X) < shelter.halfSize.X + 3 and math.abs(offset.Z) < shelter.halfSize.Z + 3 then
			return true
		end
	end
	return false
end

local function randomPosition(zone)
	local margin = 8
	for _ = 1, 20 do
		local x = zone.startX + margin + math.random() * (zone.endX - zone.startX - margin * 2)
		local z = (math.random() - 0.5) * (Config.MAP_WIDTH - margin * 2)
		local position = Vector3.new(x, 2.5, z)
		if not isNearShelter(position) then
			return position
		end
	end
	return nil
end

local function spawnItem(zone)
	local position = randomPosition(zone)
	if not position then
		return
	end

	local definition = Util.pickWeighted(zone.items)

	local part = Instance.new("Part")
	part.Name = definition.name
	part.Shape = definition.shape
	part.Size = Vector3.new(2.5, 2.5, 2.5)
	part.Anchored = true
	part.CanCollide = false
	part.Material = Enum.Material.Neon
	part.Color = definition.color
	part.Position = position
	part:SetAttribute("Value", definition.value)
	part:SetAttribute("Zone", zone.name)

	local light = Instance.new("PointLight")
	light.Color = zone.color
	light.Range = 8
	light.Brightness = 1.5
	light.Parent = part

	Util.billboard(part, string.format("%s\n💰 %d", definition.name, definition.value), zone.color, 3, 80, UDim2.fromOffset(160, 50))

	countByZone[zone.name] += 1
	part.Destroying:Connect(function()
		countByZone[zone.name] -= 1
	end)

	part.Touched:Connect(function(hit)
		if not part.Parent then
			return
		end
		local character = hit:FindFirstAncestorOfClass("Model")
		local player = character and Players:GetPlayerFromCharacter(character)
		if player and onPickup(player, part) then
			part:Destroy()
		end
	end)

	part.Parent = itemsFolder
end

function ItemSpawner.init(shelterList, pickupCallback)
	shelters = shelterList
	onPickup = pickupCallback

	itemsFolder = Instance.new("Folder")
	itemsFolder.Name = "Itens"
	itemsFolder.Parent = workspace

	for _, zone in ipairs(Config.ZONES) do
		countByZone[zone.name] = 0
		for _ = 1, zone.maxItems do
			spawnItem(zone)
		end
	end

	task.spawn(function()
		while true do
			task.wait(Config.ITEM_RESPAWN_INTERVAL)
			for _, zone in ipairs(Config.ZONES) do
				if countByZone[zone.name] < zone.maxItems then
					spawnItem(zone)
				end
			end
		end
	end)
end

return ItemSpawner
