-- Cria e move a onda do desastre do mar até a muralha da base.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local Util = require(script.Parent.Util)

local DisasterManager = {}

local THICKNESS = 30
local WIDTH = Config.MAP_WIDTH + 30

function DisasterManager.pick()
	return Util.pickWeighted(Config.DISASTERS)
end

-- isSafe(position) -> boolean; onHit(player) é chamado para quem for atingido.
-- Retorna quando a onda chega à base.
function DisasterManager.runWave(disaster, isSafe, onHit)
	local model = Instance.new("Model")
	model.Name = "Onda"

	local wave = Util.part({
		Name = "Corpo",
		Size = Vector3.new(THICKNESS, disaster.height, WIDTH),
		Material = disaster.material,
		Color = disaster.color,
		Transparency = disaster.transparency,
		CanCollide = false,
		CanTouch = false,
		CanQuery = false,
		CastShadow = false,
		Parent = model,
	})
	local foam = Util.part({
		Name = "Espuma",
		Size = Vector3.new(THICKNESS + 4, 4, WIDTH),
		Material = Enum.Material.Neon,
		Color = disaster.foamColor,
		Transparency = 0.1,
		CanCollide = false,
		CanTouch = false,
		CanQuery = false,
		CastShadow = false,
		Parent = model,
	})
	model.PrimaryPart = wave
	model:SetAttribute("Height", disaster.height)
	model.Parent = workspace

	local front = Config.MAP_LENGTH + 40
	local function place()
		wave.Position = Vector3.new(front + THICKNESS / 2, disaster.height / 2, 0)
		foam.Position = Vector3.new(front + THICKNESS / 2 - 2, disaster.height + 1, 0)
	end
	place()

	while front > 0 do
		local dt = RunService.Heartbeat:Wait()
		local previousFront = front
		front = math.max(front - disaster.speed * dt, 0)
		place()

		-- Atinge quem estiver entre a frente atual e a traseira da onda
		for _, player in ipairs(Players:GetPlayers()) do
			local character = player.Character
			local root = character and character:FindFirstChild("HumanoidRootPart")
			local humanoid = character and character:FindFirstChildOfClass("Humanoid")
			if root and humanoid and humanoid.Health > 0 then
				local position = root.Position
				local inWave = position.X >= front and position.X <= previousFront + THICKNESS
				if inWave and position.Y < disaster.height + 4 and not isSafe(position) then
					onHit(player)
				end
			end
		end
	end

	-- A onda bate na muralha e se desfaz
	for i = 1, 20 do
		wave.Transparency = disaster.transparency + (1 - disaster.transparency) * i / 20
		foam.Transparency = 0.1 + 0.9 * i / 20
		task.wait(0.05)
	end
	model:Destroy()
end

return DisasterManager
