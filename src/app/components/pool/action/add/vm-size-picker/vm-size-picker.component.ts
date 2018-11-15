import {
    ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, forwardRef,
} from "@angular/core";
import {
    ControlValueAccessor, FormControl, NG_VALIDATORS, NG_VALUE_ACCESSOR,
} from "@angular/forms";
import { LoadingStatus } from "@batch-flask/ui";
import { StringUtils, exists, prettyBytes } from "@batch-flask/utils";
import { VmSize, VmSizeFilterValue } from "app/models";
import { PoolOsSources } from "app/models/forms";
import { PricingService, VmSizeService } from "app/services";
import { OSPricing } from "app/services/pricing";
import { List } from "immutable";
import { Subscription } from "rxjs";

import { TableConfig } from "@batch-flask/ui/table";
import "./vm-size-picker.scss";

const categoriesDisplayName = {
    all: "All",
    standard: "General purpose",
    compute: "Compute optimized",
    memory: "Memory optimized",
    storage: "Storage optimized",
    gpu: "GPU",
    hpc: "High performance compute",
    a: "A series",
    d: "D series",
    ev3: "Ev3 series",
    f: "F series",
    g: "G series",
    h: "H series",
    nc: "NC series",
    nv: "NV series",
    m: "M series",
};

export class VmSizeDecorator {
    public id: string;
    public title: string;
    public prettyCores: string;
    public prettyRAM: string;
    public prettyOSDiskSize: string;
    public prettyResourceDiskSize: string;
    public price: number;
    public prettyPrice: string;

    constructor(public vmSize: VmSize, prices: OSPricing) {
        this.id = vmSize.id;
        this.title = this.prettyTitle(vmSize.name);
        this.prettyCores = this.prettyMb(vmSize.numberOfCores);
        this.prettyRAM = this.prettyMb(vmSize.memoryInMB);
        this.prettyOSDiskSize = this.prettyMb(vmSize.osDiskSizeInMB);
        this.prettyResourceDiskSize = this.prettyMb(vmSize.resourceDiskSizeInMB);

        const price = prices && prices.getPrice(vmSize.name.toLowerCase());
        if (exists(price)) {
            this.price = price;
            this.prettyPrice = `${"USD"} ${price.toFixed(2)}`;
        } else {
            this.price = -1;
        }
    }

    public prettyMb(megaBytes: number) {
        return prettyBytes(megaBytes * 1000 * 1000, 0);
    }

    public prettyTitle(vmSize: string) {
        return vmSize.replace(/_/g, " ");
    }
}

@Component({
    selector: "bl-vm-size-picker",
    templateUrl: "vm-size-picker.html",
    providers: [
        { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => VmSizePickerComponent), multi: true },
        { provide: NG_VALIDATORS, useExisting: forwardRef(() => VmSizePickerComponent), multi: true },
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VmSizePickerComponent implements ControlValueAccessor, OnInit, OnChanges, OnDestroy {
    @Input() public osSource: PoolOsSources;

    @Input() public osType: "linux" | "windows";

    public pickedSize: string;
    public loadingStatus: LoadingStatus = LoadingStatus.Loading;
    public categoryNames: string[];
    public filteredCategories: VmSizeDecorator[];
    public prices: OSPricing = null;
    public categoriesDisplayName = categoriesDisplayName;

    public tableConfig: TableConfig = {
        sorting: {
            title: (size: VmSizeDecorator) => size.vmSize.name,
            cores: (size: VmSizeDecorator) => size.vmSize.numberOfCores,
            ram: (size: VmSizeDecorator) => size.vmSize.memoryInMB,
            osDisk: (size: VmSizeDecorator) => size.vmSize.osDiskSizeInMB,
            resourceDisk: (size: VmSizeDecorator) => size.vmSize.resourceDiskSizeInMB,
        },
    };

    private _propagateChange: (value: string) => void = null;
    private _categoryRegex: StringMap<string[]>;
    private _vmSizes: List<VmSize> = List([]);
    private _sizeSub: Subscription;
    private _categorySub: Subscription;
    private _currentFilter: VmSizeFilterValue = {
        category: "standard",
    };

    constructor(
        private changeDetector: ChangeDetectorRef,
        private vmSizeService: VmSizeService,
        private pricingService: PricingService) {
    }

    public ngOnInit() {
        this._categorySub = this.vmSizeService.vmSizeCategories.subscribe((categories) => {
            this._categoryRegex = categories;
            this._categorizeSizes();
        });
        this._loadPrices();
    }

    public ngOnChanges(inputs) {
        if (inputs.osSource) {
            if (this._sizeSub) {
                this._sizeSub.unsubscribe();
            }
            let sizes;
            if (this.osSource === PoolOsSources.IaaS) {
                sizes = this.vmSizeService.virtualMachineSizes;
            } else {
                sizes = this.vmSizeService.cloudServiceSizes;
            }
            this.loadingStatus = LoadingStatus.Loading;
            this._sizeSub = sizes.subscribe(x => {
                this._vmSizes = x;
                this._categorizeSizes();
            });
        }

        if (inputs.osType) {
            this._loadPrices();
        }
    }

    public ngOnDestroy() {
        if (this._sizeSub) {
            this._sizeSub.unsubscribe();
        }
        this._categorySub.unsubscribe();
    }

    public writeValue(value: any) {
        this.pickedSize = value;
    }

    public registerOnChange(fn) {
        this._propagateChange = fn;
    }

    public registerOnTouched() {
        // Do nothing
    }

    public validate(c: FormControl) {
        return null;
    }

    public onFilterChange(filter) {
        console.log("onFilterChange", filter);
        this._currentFilter = filter;
        this._categorizeSizes();
    }

    public pickSize(size: string) {
        if (size === this.pickedSize) { return; }
        this.pickedSize = size;
        if (this._propagateChange) {
            this._propagateChange(size);
        }
    }

    public trackVmSize(index, size: VmSizeDecorator) {
        return size.vmSize.id;
    }

    private _categorizeSizes() {
        if (!this._vmSizes) { return; }
        this.loadingStatus = LoadingStatus.Ready;
        let vmSizes = this._vmSizes.toArray();
        if (this._currentFilter && this._categoryRegex) {
            if (this._currentFilter.category) {
                vmSizes = vmSizes.filter(vmSize => {
                    return this._categoryMatchPattern(vmSize, this._categoryRegex[this._currentFilter.category]);
                });
            }
            if (this._currentFilter.searchName) {
                vmSizes = vmSizes.filter(vmSize => {
                    return vmSize.name.toLowerCase().includes(this._currentFilter.searchName.toLowerCase());
                });
            }
        }
        this.filteredCategories = vmSizes.map(x => new VmSizeDecorator(x, this.prices));
        this.changeDetector.markForCheck();
    }

    private _categoryMatchPattern(size: VmSize, patterns: string[]) {
        for (const pattern of patterns) {
            if (StringUtils.regexExpTest(size.name.toLowerCase(), pattern)) {
                return true;
            }
        }
        return false;
    }

    private _loadPrices() {
        const os = this.osType || "linux";
        return this.pricingService.getPrices(os).subscribe((prices: OSPricing) => {
            this.prices = prices;
            this._categorizeSizes();
        });
    }
}
