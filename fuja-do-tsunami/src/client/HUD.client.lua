-- Interface do jogador: status do desastre, mochila, moedas, loja e notificações.
-- Também gira os itens e treme a câmera quando a onda está perto.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local remotes = ReplicatedStorage:WaitForChild("Remotes")
local buyUpgrade = remotes:WaitForChild("BuyUpgrade")
local notifyEvent = remotes:WaitForChild("Notify")
local openShopEvent = remotes:WaitForChild("OpenShop")

local player = Players.LocalPlayer

local function create(className, props, children)
	local instance = Instance.new(className)
	for key, value in pairs(props) do
		if key ~= "Parent" then
			instance[key] = value
		end
	end
	for _, child in ipairs(children or {}) do
		child.Parent = instance
	end
	instance.Parent = props.Parent
	return instance
end

local function corner(radius)
	return create("UICorner", { CornerRadius = UDim.new(0, radius or 10) })
end

local function stroke()
	return create("UIStroke", { Thickness = 2, Color = Color3.fromRGB(20, 20, 30), Transparency = 0.3 })
end

local gui = create("ScreenGui", {
	Name = "HUD",
	ResetOnSpawn = false,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	Parent = player:WaitForChild("PlayerGui"),
})

-- Status do desastre ----------------------------------------------------------
local statusFrame = create("Frame", {
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 12),
	Size = UDim2.fromOffset(520, 56),
	BackgroundColor3 = Color3.fromRGB(30, 60, 110),
	Parent = gui,
}, { corner(14), stroke() })

local statusLabel = create("TextLabel", {
	Size = UDim2.new(1, -20, 1, 0),
	Position = UDim2.fromOffset(10, 0),
	BackgroundTransparency = 1,
	Font = Enum.Font.FredokaOne,
	TextScaled = true,
	TextColor3 = Color3.new(1, 1, 1),
	Text = "Carregando...",
	Parent = statusFrame,
})

local flashTween

local function updateStatus()
	local phase = ReplicatedStorage:GetAttribute("Phase")
	local timeLeft = ReplicatedStorage:GetAttribute("TimeLeft") or 0
	local disaster = ReplicatedStorage:GetAttribute("Disaster") or ""

	if flashTween then
		flashTween:Cancel()
		flashTween = nil
	end

	if phase == "Calmo" then
		statusFrame.BackgroundColor3 = Color3.fromRGB(30, 60, 110)
		statusLabel.Text = string.format("☀ Colete itens! Próximo desastre em %ds", timeLeft)
	elseif phase == "Alerta" then
		statusFrame.BackgroundColor3 = Color3.fromRGB(200, 40, 40)
		statusLabel.Text = string.format("⚠ %s em %ds! Corra para um ABRIGO!", disaster, timeLeft)
		flashTween = TweenService:Create(
			statusFrame,
			TweenInfo.new(0.4, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
			{ BackgroundColor3 = Color3.fromRGB(255, 120, 40) }
		)
		flashTween:Play()
	elseif phase == "Onda" then
		statusFrame.BackgroundColor3 = Color3.fromRGB(120, 20, 20)
		statusLabel.Text = string.format("🌊 %s! Fique protegido!", disaster)
	end
end

for _, attribute in ipairs({ "Phase", "TimeLeft", "Disaster" }) do
	ReplicatedStorage:GetAttributeChangedSignal(attribute):Connect(updateStatus)
end
updateStatus()

-- Painel do jogador -----------------------------------------------------------
local infoFrame = create("Frame", {
	AnchorPoint = Vector2.new(0, 1),
	Position = UDim2.new(0, 12, 1, -12),
	Size = UDim2.fromOffset(250, 110),
	BackgroundColor3 = Color3.fromRGB(25, 25, 35),
	BackgroundTransparency = 0.2,
	Parent = gui,
}, {
	corner(12),
	stroke(),
	create("UIPadding", {
		PaddingLeft = UDim.new(0, 12),
		PaddingRight = UDim.new(0, 12),
		PaddingTop = UDim.new(0, 8),
		PaddingBottom = UDim.new(0, 8),
	}),
	create("UIListLayout", { Padding = UDim.new(0, 4) }),
})

local function infoLine(color)
	return create("TextLabel", {
		Size = UDim2.new(1, 0, 0, 28),
		BackgroundTransparency = 1,
		Font = Enum.Font.FredokaOne,
		TextScaled = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = color,
		Parent = infoFrame,
	})
end

local coinsLabel = infoLine(Color3.fromRGB(255, 220, 60))
local carryLabel = infoLine(Color3.fromRGB(255, 255, 255))
local valueLabel = infoLine(Color3.fromRGB(150, 255, 150))

local function updateInfo()
	local carried = player:GetAttribute("Carried") or 0
	local maxCarry = player:GetAttribute("MaxCarry") or 0
	coinsLabel.Text = string.format("💰 Moedas: %d", player:GetAttribute("Coins") or 0)
	carryLabel.Text = string.format("🎒 Mochila: %d/%d", carried, maxCarry)
	carryLabel.TextColor3 = carried >= maxCarry and maxCarry > 0 and Color3.fromRGB(255, 120, 80) or Color3.new(1, 1, 1)
	valueLabel.Text = string.format("💎 Carregando: %d", player:GetAttribute("CarriedValue") or 0)
end

-- Loja ------------------------------------------------------------------------
local shopFrame = create("Frame", {
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.5),
	Size = UDim2.fromOffset(440, 330),
	BackgroundColor3 = Color3.fromRGB(30, 30, 45),
	Visible = false,
	Parent = gui,
}, { corner(16), stroke() })

create("TextLabel", {
	Size = UDim2.new(1, -60, 0, 50),
	Position = UDim2.fromOffset(16, 6),
	BackgroundTransparency = 1,
	Font = Enum.Font.FredokaOne,
	TextScaled = true,
	TextXAlignment = Enum.TextXAlignment.Left,
	TextColor3 = Color3.new(1, 1, 1),
	Text = "🛒 Loja de Melhorias",
	Parent = shopFrame,
})

local closeButton = create("TextButton", {
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -10, 0, 10),
	Size = UDim2.fromOffset(40, 40),
	BackgroundColor3 = Color3.fromRGB(200, 60, 60),
	Font = Enum.Font.FredokaOne,
	TextScaled = true,
	TextColor3 = Color3.new(1, 1, 1),
	Text = "X",
	Parent = shopFrame,
}, { corner(8) })

local rowsFrame = create("Frame", {
	Position = UDim2.fromOffset(16, 66),
	Size = UDim2.new(1, -32, 1, -82),
	BackgroundTransparency = 1,
	Parent = shopFrame,
}, { create("UIListLayout", { Padding = UDim.new(0, 12) }) })

local rows = {}

local function refreshShop()
	local coins = player:GetAttribute("Coins") or 0
	for key, row in pairs(rows) do
		local upgrade = Config.UPGRADES[key]
		local level = player:GetAttribute(upgrade.dataKey) or 0
		local current = Config.getUpgradeValue(key, level)
		if level >= upgrade.maxLevel then
			row.info.Text = string.format("Nível %d/%d • Atual: %d", level, upgrade.maxLevel, current)
			row.button.Text = "MÁXIMO"
			row.button.BackgroundColor3 = Color3.fromRGB(90, 90, 100)
		else
			local cost = Config.getUpgradeCost(key, level)
			row.info.Text = string.format(
				"Nível %d/%d • %d → %d",
				level,
				upgrade.maxLevel,
				current,
				Config.getUpgradeValue(key, level + 1)
			)
			row.button.Text = string.format("💰 %d", cost)
			row.button.BackgroundColor3 = coins >= cost and Color3.fromRGB(60, 180, 80) or Color3.fromRGB(120, 120, 130)
		end
	end
end

local showToast

for _, key in ipairs(Config.UPGRADE_ORDER) do
	local upgrade = Config.UPGRADES[key]
	local row = create("Frame", {
		Size = UDim2.new(1, 0, 0, 104),
		BackgroundColor3 = Color3.fromRGB(45, 45, 65),
		Parent = rowsFrame,
	}, { corner(12) })

	create("TextLabel", {
		Position = UDim2.fromOffset(12, 6),
		Size = UDim2.new(1, -160, 0, 34),
		BackgroundTransparency = 1,
		Font = Enum.Font.FredokaOne,
		TextScaled = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Color3.new(1, 1, 1),
		Text = upgrade.name,
		Parent = row,
	})
	create("TextLabel", {
		Position = UDim2.fromOffset(12, 42),
		Size = UDim2.new(1, -160, 0, 22),
		BackgroundTransparency = 1,
		Font = Enum.Font.Gotham,
		TextScaled = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Color3.fromRGB(200, 200, 220),
		Text = upgrade.description,
		Parent = row,
	})
	local info = create("TextLabel", {
		Position = UDim2.fromOffset(12, 68),
		Size = UDim2.new(1, -160, 0, 24),
		BackgroundTransparency = 1,
		Font = Enum.Font.GothamBold,
		TextScaled = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Color3.fromRGB(150, 220, 255),
		Parent = row,
	})
	local button = create("TextButton", {
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -12, 0.5, 0),
		Size = UDim2.fromOffset(130, 56),
		Font = Enum.Font.FredokaOne,
		TextScaled = true,
		TextColor3 = Color3.new(1, 1, 1),
		Parent = row,
	}, { corner(10) })

	button.Activated:Connect(function()
		local ok, message = buyUpgrade:InvokeServer(key)
		showToast(message, ok and Color3.fromRGB(120, 255, 120) or Color3.fromRGB(255, 120, 120))
		refreshShop()
	end)

	rows[key] = { info = info, button = button }
end

local shopButton = create("TextButton", {
	AnchorPoint = Vector2.new(1, 0.5),
	Position = UDim2.new(1, -12, 0.5, 0),
	Size = UDim2.fromOffset(120, 54),
	BackgroundColor3 = Color3.fromRGB(240, 170, 30),
	Font = Enum.Font.FredokaOne,
	TextScaled = true,
	TextColor3 = Color3.new(1, 1, 1),
	Text = "🛒 LOJA",
	Parent = gui,
}, { corner(12), stroke() })

local function setShopVisible(visible)
	shopFrame.Visible = visible
	if visible then
		refreshShop()
	end
end

shopButton.Activated:Connect(function()
	setShopVisible(not shopFrame.Visible)
end)
closeButton.Activated:Connect(function()
	setShopVisible(false)
end)
openShopEvent.OnClientEvent:Connect(function()
	setShopVisible(true)
end)

-- Atualiza painel e loja quando os atributos do jogador mudam
for _, attribute in ipairs({ "Coins", "Carried", "CarriedValue", "MaxCarry", "SpeedLevel", "CapacityLevel" }) do
	player:GetAttributeChangedSignal(attribute):Connect(function()
		updateInfo()
		if shopFrame.Visible then
			refreshShop()
		end
	end)
end
updateInfo()

-- Notificações ----------------------------------------------------------------
local toastFrame = create("Frame", {
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -130),
	Size = UDim2.fromOffset(500, 200),
	BackgroundTransparency = 1,
	Parent = gui,
}, {
	create("UIListLayout", {
		VerticalAlignment = Enum.VerticalAlignment.Bottom,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Padding = UDim.new(0, 4),
	}),
})

showToast = function(text, color)
	local label = create("TextLabel", {
		Size = UDim2.new(1, 0, 0, 32),
		BackgroundTransparency = 1,
		Font = Enum.Font.FredokaOne,
		TextScaled = true,
		TextColor3 = color or Color3.new(1, 1, 1),
		TextStrokeTransparency = 0,
		Text = text,
		Parent = toastFrame,
	})

	local items = toastFrame:GetChildren()
	local labels = {}
	for _, child in ipairs(items) do
		if child:IsA("TextLabel") then
			table.insert(labels, child)
		end
	end
	if #labels > 5 then
		labels[1]:Destroy()
	end

	task.delay(2.5, function()
		if label.Parent then
			local tween = TweenService:Create(label, TweenInfo.new(0.5), { TextTransparency = 1, TextStrokeTransparency = 1 })
			tween:Play()
			tween.Completed:Wait()
			label:Destroy()
		end
	end)
end

notifyEvent.OnClientEvent:Connect(showToast)

-- Efeitos locais --------------------------------------------------------------
RunService.RenderStepped:Connect(function(dt)
	-- Gira os itens colecionáveis (apenas visual, no cliente)
	local itemsFolder = workspace:FindFirstChild("Itens")
	if itemsFolder then
		local rotation = CFrame.Angles(0, dt * 2, 0)
		for _, item in ipairs(itemsFolder:GetChildren()) do
			item.CFrame = item.CFrame * rotation
		end
	end

	-- Tremor de câmera quando a onda está perto
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not (humanoid and root) then
		return
	end

	local wave = workspace:FindFirstChild("Onda")
	local body = wave and wave:FindFirstChild("Corpo")
	if body then
		local distance = math.abs(body.Position.X - root.Position.X)
		local intensity = math.clamp(1 - distance / 150, 0, 1) * 0.6
		humanoid.CameraOffset = Vector3.new(
			(math.random() - 0.5) * intensity,
			(math.random() - 0.5) * intensity,
			(math.random() - 0.5) * intensity
		)
	elseif humanoid.CameraOffset ~= Vector3.zero then
		humanoid.CameraOffset = Vector3.zero
	end
end)
